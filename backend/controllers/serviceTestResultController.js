import { getAuth } from "@clerk/express";
import { supabase } from "../config/supabase.js";
import { uploadToCloudinary } from "../utils/cloudinary.js";
import { sendServiceTestResultAvailableEmail } from "../utils/email.js";

const MAJOR_ADMIN_ID = process.env.MAJOR_ADMIN_ID || null;
const VALID_RESULT_STATUSES = new Set(["Draft", "Available", "Hidden"]);
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeOptionalEmail(value) {
    const email = String(value || "").trim().toLowerCase();
    return EMAIL_REGEX.test(email) ? email : "";
}

function trimString(value) {
    return String(value ?? "").trim();
}

function resolveClerkUserId(req) {
    try {
        const auth = typeof req.auth === "function" ? req.auth() : (req.auth || {});
        const candidate = auth?.userId || auth?.user_id || auth?.user?.id || req.user?.id || null;
        if (candidate) return candidate;

        try {
            const serverAuth = getAuth ? getAuth(req) : null;
            return serverAuth?.userId || null;
        } catch {
            return null;
        }
    } catch {
        return null;
    }
}

function resolveAdminIdentity(req) {
    const clerkUserId = resolveClerkUserId(req);
    if (clerkUserId) {
        return { id: clerkUserId, verifiedByClerk: true };
    }

    const headerAdminId = trimString(req.get("x-admin-id"));
    if (headerAdminId) {
        return { id: headerAdminId, verifiedByClerk: false };
    }

    return { id: null, verifiedByClerk: false };
}

function validateAdminRequest(req, res) {
    if (!MAJOR_ADMIN_ID) {
        res.status(500).json({
            success: false,
            message: "Admin identity is not configured on the server.",
        });
        return null;
    }

    const adminIdentity = resolveAdminIdentity(req);
    if (!adminIdentity.id) {
        res.status(401).json({
            success: false,
            message: "Admin authorization required.",
        });
        return null;
    }

    if (String(adminIdentity.id) !== String(MAJOR_ADMIN_ID)) {
        res.status(403).json({
            success: false,
            message: "Only the configured admin can manage service test results.",
        });
        return null;
    }

    return adminIdentity;
}

function normalizeResultStatus(value, fallback = "Draft") {
    const status = trimString(value);
    if (!status) return fallback;

    const match = Array.from(VALID_RESULT_STATUSES).find(
        (item) => item.toLowerCase() === status.toLowerCase()
    );

    return match || null;
}

function hasOwnValue(body, keys) {
    return keys.some((key) => Object.prototype.hasOwnProperty.call(body, key));
}

function readFirstDefined(body, keys) {
    for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(body, key)) {
            return body[key];
        }
    }

    return undefined;
}

function parseResultValues(raw) {
    if (raw === undefined) {
        return { provided: false, value: undefined, error: null };
    }

    if (raw === null || raw === "") {
        return { provided: true, value: null, error: null };
    }

    if (typeof raw === "object") {
        return { provided: true, value: raw, error: null };
    }

    try {
        return { provided: true, value: JSON.parse(String(raw)), error: null };
    } catch {
        return {
            provided: true,
            value: null,
            error: "result_values must be valid JSON when provided.",
        };
    }
}

function formatServiceTestResult(row, { includePatient = true } = {}) {
    if (!row) return null;

    const formatted = {
        _id: row.id,
        id: row.id,
        serviceAppointmentId: row.service_appointment_id,
        serviceId: row.service_id,
        resultTitle: row.result_title,
        resultSummary: row.result_summary || "",
        resultValues: row.result_values || null,
        resultFileUrl: row.result_file_url || "",
        resultFilePublicId: row.result_file_public_id || "",
        resultStatus: row.result_status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };

    if (includePatient) {
        formatted.patientClerkId = row.patient_clerk_id;
        formatted.uploadedBy = row.uploaded_by || "";
    }

    return formatted;
}

async function fetchServiceAppointment(appointmentId) {
    const { data, error } = await supabase
        .from("service_appointments")
        .select("id, created_by, service_id, service_name, patient_name, patient_email, payment, status")
        .eq("id", appointmentId)
        .maybeSingle();

    if (error) throw error;
    return data || null;
}

async function fetchResultByAppointment(appointmentId) {
    const { data, error } = await supabase
        .from("service_test_results")
        .select("*")
        .eq("service_appointment_id", appointmentId)
        .maybeSingle();

    if (error) throw error;
    return data || null;
}

async function notifyResultAvailable({ appointment, result }) {
    const patientEmail = normalizeOptionalEmail(appointment?.patient_email || "");
    if (!patientEmail) return;

    try {
        await sendServiceTestResultAvailableEmail({
            to: patientEmail,
            patientName: appointment?.patient_name || "",
            serviceName: appointment?.service_name || "",
            resultTitle: result?.result_title || result?.resultTitle || "",
        });
    } catch (emailError) {
        console.warn("Service result notification email failed:", emailError?.message || emailError);
    }
}

export const getAdminServiceTestResultByAppointment = async (req, res) => {
    try {
        const adminIdentity = validateAdminRequest(req, res);
        if (!adminIdentity) return;

        const { appointmentId } = req.params;
        const appointment = await fetchServiceAppointment(appointmentId);

        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: "Service appointment not found.",
            });
        }

        const result = await fetchResultByAppointment(appointmentId);
        const formatted = formatServiceTestResult(result);

        return res.json({
            success: true,
            result: formatted,
            data: formatted,
        });
    } catch (err) {
        console.error("getAdminServiceTestResultByAppointment unexpected:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

export const upsertServiceTestResult = async (req, res) => {
    try {
        const adminIdentity = validateAdminRequest(req, res);
        if (!adminIdentity) return;

        const { appointmentId } = req.params;
        const body = req.body || {};
        const appointment = await fetchServiceAppointment(appointmentId);

        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: "Service appointment not found.",
            });
        }

        if (!appointment.created_by) {
            return res.status(400).json({
                success: false,
                message: "Service appointment does not have a patient owner.",
            });
        }

        const existing = await fetchResultByAppointment(appointmentId);
        const rawStatus = readFirstDefined(body, ["result_status", "resultStatus", "status"]);
        const normalizedStatus = normalizeResultStatus(rawStatus, existing?.result_status || "Draft");

        if (!normalizedStatus) {
            return res.status(400).json({
                success: false,
                message: "result_status must be Draft, Available, or Hidden.",
            });
        }

        const titleProvided = hasOwnValue(body, ["result_title", "resultTitle"]);
        const titleValue = titleProvided
            ? trimString(readFirstDefined(body, ["result_title", "resultTitle"]))
            : trimString(existing?.result_title);

        if (!titleValue) {
            return res.status(400).json({
                success: false,
                message: "result_title is required.",
            });
        }

        const summaryProvided = hasOwnValue(body, ["result_summary", "resultSummary"]);
        const summaryValue = summaryProvided
            ? trimString(readFirstDefined(body, ["result_summary", "resultSummary"])) || null
            : existing?.result_summary || null;

        const rawValues = readFirstDefined(body, ["result_values", "resultValues", "resultValuesJson"]);
        const parsedValues = parseResultValues(rawValues);
        if (parsedValues.error) {
            return res.status(400).json({
                success: false,
                message: parsedValues.error,
            });
        }

        let resultFileUrl = existing?.result_file_url || null;
        let resultFilePublicId = existing?.result_file_public_id || null;

        if (hasOwnValue(body, ["clearResultFile", "clear_result_file"]) &&
            String(readFirstDefined(body, ["clearResultFile", "clear_result_file"])).toLowerCase() === "true") {
            resultFileUrl = null;
            resultFilePublicId = null;
        }

        if (hasOwnValue(body, ["result_file_url", "resultFileUrl"])) {
            resultFileUrl = trimString(readFirstDefined(body, ["result_file_url", "resultFileUrl"])) || null;
            if (!resultFileUrl) resultFilePublicId = null;
        }

        if (req.file?.path) {
            const uploaded = await uploadToCloudinary(req.file.path, "service-test-results", "auto");
            resultFileUrl = uploaded?.secure_url || uploaded?.url || resultFileUrl;
            resultFilePublicId = uploaded?.public_id || uploaded?.publicId || resultFilePublicId;
        }

        const payload = {
            service_appointment_id: appointment.id,
            patient_clerk_id: appointment.created_by,
            service_id: appointment.service_id || null,
            result_title: titleValue,
            result_summary: summaryValue,
            result_values: parsedValues.provided ? parsedValues.value : existing?.result_values || null,
            result_file_url: resultFileUrl,
            result_file_public_id: resultFilePublicId,
            result_status: normalizedStatus,
            uploaded_by: adminIdentity.id,
            updated_at: new Date().toISOString(),
        };

        const { data, error } = await supabase
            .from("service_test_results")
            .upsert(payload, { onConflict: "service_appointment_id" })
            .select()
            .single();

        if (error) throw error;

        const formatted = formatServiceTestResult(data);
        return res.json({
            success: true,
            message: "Service test result saved.",
            result: formatted,
            data: formatted,
        });
    } catch (err) {
        console.error("upsertServiceTestResult unexpected:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

export const publishServiceTestResult = async (req, res) => {
    try {
        const adminIdentity = validateAdminRequest(req, res);
        if (!adminIdentity) return;

        const { appointmentId } = req.params;
        const appointment = await fetchServiceAppointment(appointmentId);

        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: "Service appointment not found.",
            });
        }

        const existing = await fetchResultByAppointment(appointmentId);
        if (!existing) {
            return res.status(404).json({
                success: false,
                message: "Create a result before publishing it.",
            });
        }

        if (!trimString(existing.result_title)) {
            return res.status(400).json({
                success: false,
                message: "result_title is required before publishing.",
            });
        }

        const wasAlreadyAvailable = existing.result_status === "Available";
        const { data, error } = await supabase
            .from("service_test_results")
            .update({
                result_status: "Available",
                uploaded_by: adminIdentity.id,
                updated_at: new Date().toISOString(),
            })
            .eq("service_appointment_id", appointmentId)
            .select()
            .single();

        if (error) throw error;

        if (!wasAlreadyAvailable) {
            notifyResultAvailable({ appointment, result: data });
        }

        const formatted = formatServiceTestResult(data);
        return res.json({
            success: true,
            message: "Service test result published.",
            result: formatted,
            data: formatted,
        });
    } catch (err) {
        console.error("publishServiceTestResult unexpected:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

export const hideServiceTestResult = async (req, res) => {
    try {
        const adminIdentity = validateAdminRequest(req, res);
        if (!adminIdentity) return;

        const { appointmentId } = req.params;
        const appointment = await fetchServiceAppointment(appointmentId);

        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: "Service appointment not found.",
            });
        }

        const existing = await fetchResultByAppointment(appointmentId);
        if (!existing) {
            return res.status(404).json({
                success: false,
                message: "No result exists for this service appointment.",
            });
        }

        const { data, error } = await supabase
            .from("service_test_results")
            .update({
                result_status: "Hidden",
                uploaded_by: adminIdentity.id,
                updated_at: new Date().toISOString(),
            })
            .eq("service_appointment_id", appointmentId)
            .select()
            .single();

        if (error) throw error;

        const formatted = formatServiceTestResult(data);
        return res.json({
            success: true,
            message: "Service test result hidden.",
            result: formatted,
            data: formatted,
        });
    } catch (err) {
        console.error("hideServiceTestResult unexpected:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

export const getMyServiceTestResultByAppointment = async (req, res) => {
    try {
        const clerkUserId = resolveClerkUserId(req);
        if (!clerkUserId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized: User ID not found in request.",
            });
        }

        const { appointmentId } = req.params;
        const { data: appointment, error: appointmentError } = await supabase
            .from("service_appointments")
            .select("id")
            .eq("id", appointmentId)
            .eq("created_by", clerkUserId)
            .maybeSingle();

        if (appointmentError) throw appointmentError;
        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: "Service appointment not found.",
            });
        }

        const { data, error } = await supabase
            .from("service_test_results")
            .select("*")
            .eq("service_appointment_id", appointmentId)
            .eq("patient_clerk_id", clerkUserId)
            .eq("result_status", "Available")
            .maybeSingle();

        if (error) throw error;

        const formatted = formatServiceTestResult(data, { includePatient: false });
        return res.json({
            success: true,
            result: formatted,
            data: formatted,
            message: formatted ? "Service test result found." : "Your result is not available yet.",
        });
    } catch (err) {
        console.error("getMyServiceTestResultByAppointment unexpected:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

export const getMyServiceTestResults = async (req, res) => {
    try {
        const clerkUserId = resolveClerkUserId(req);
        if (!clerkUserId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized: User ID not found in request.",
            });
        }

        const { data, error } = await supabase
            .from("service_test_results")
            .select("*")
            .eq("patient_clerk_id", clerkUserId)
            .eq("result_status", "Available")
            .order("updated_at", { ascending: false });

        if (error) throw error;

        const results = (data || []).map((row) => formatServiceTestResult(row, { includePatient: false }));
        return res.json({
            success: true,
            results,
            data: results,
        });
    } catch (err) {
        console.error("getMyServiceTestResults unexpected:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

export default {
    getAdminServiceTestResultByAppointment,
    upsertServiceTestResult,
    publishServiceTestResult,
    hideServiceTestResult,
    getMyServiceTestResultByAppointment,
    getMyServiceTestResults,
};
