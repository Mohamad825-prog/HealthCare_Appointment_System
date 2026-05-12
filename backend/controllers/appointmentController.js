import Stripe from "stripe";
import { getAuth } from "@clerk/express";
import { clerkClient } from "@clerk/clerk-sdk-node";
import { supabase } from "../config/supabase.js";
import {
    sendCashPaymentConfirmedEmail,
    sendAppointmentCreatedEmail,
    sendAppointmentStatusEmail,
} from "../utils/email.js";
import {
    calculateAgeFromDateOfBirth,
    fetchPatientProfileByClerkUserId,
    trimString,
} from "../utils/patientProfile.js";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
console.log("Stripe key loaded?", Boolean(process.env.STRIPE_SECRET_KEY));
const FRONTEND_URL = process.env.FRONTEND_URL;
const MAJOR_ADMIN_ID = process.env.MAJOR_ADMIN_ID || null;
const ZERO_DECIMAL_CURRENCIES = new Set([
    "bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga",
    "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf",
]);

function normalizeStripeCurrency(value) {
    const currency = String(value || "usd").trim().toLowerCase();
    return /^[a-z]{3}$/.test(currency) ? currency : "usd";
}

const STRIPE_CURRENCY = normalizeStripeCurrency(process.env.STRIPE_CURRENCY || "usd");

function toStripeUnitAmount(amount, currency = STRIPE_CURRENCY) {
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount)) return 0;
    return ZERO_DECIMAL_CURRENCIES.has(normalizeStripeCurrency(currency))
        ? Math.round(numericAmount)
        : Math.round(numericAmount * 100);
}

function fromStripeUnitAmount(amount, currency = STRIPE_CURRENCY) {
    const numericAmount = Number(amount || 0);
    return ZERO_DECIMAL_CURRENCIES.has(normalizeStripeCurrency(currency))
        ? numericAmount
        : Math.round(numericAmount) / 100;
}

const stripe = STRIPE_SECRET_KEY
    ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" })
    : null;
// Appointment statuses stay compatible with the existing app:
// Pending = waiting, Confirmed = accepted, Completed = visit finished, Canceled = rejected/canceled.
const CANCELED_APPOINTMENT_STATUSES = ["Canceled", "Cancelled"];
const DECLINED_APPOINTMENT_STATUSES = ["Declined"];
const CANCELED_STATUS_FILTER = `(${CANCELED_APPOINTMENT_STATUSES.join(",")})`;
const SLOT_ALREADY_BOOKED_MESSAGE = "This appointment slot is already booked. Please choose another time.";
const SLOT_JUST_BOOKED_MESSAGE = "This appointment slot was just booked by another patient. Please choose another time.";
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_PAYMENT_STATUSES = ["Pending", "Paid", "Failed", "Refunded"];
const columnSupportCache = new Map();
const columnWarningCache = new Set();

// Helpers
// Safely parse a value to a number, returning null if it's not a valid number
const safeNumber = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};

const normalizeAppointmentStatus = (status) => String(status || "").trim();
const normalizePaymentMethod = (method) =>
    String(method || "").trim().toLowerCase() === "cash" ? "Cash" : "Online";
const normalizePaymentStatus = (status) => {
    const incoming = String(status || "").trim();
    return VALID_PAYMENT_STATUSES.find((item) => item.toLowerCase() === incoming.toLowerCase()) || "Pending";
};
const normalizeOptionalEmail = (value) => {
    const email = String(value || "").trim().toLowerCase();
    return EMAIL_REGEX.test(email) ? email : "";
};
const getAdminNotifyEmail = () => normalizeOptionalEmail(process.env.ADMIN_NOTIFY_EMAIL);

const isCanceledStatus = (status) =>
    CANCELED_APPOINTMENT_STATUSES.includes(normalizeAppointmentStatus(status));

const isDeclinedStatus = (status) =>
    DECLINED_APPOINTMENT_STATUSES.includes(normalizeAppointmentStatus(status));

const isCompletedStatus = (status) =>
    normalizeAppointmentStatus(status) === "Completed";

const isTerminalAppointmentStatus = (status) =>
    isCompletedStatus(status) || isCanceledStatus(status);

const hasPaymentMutation = (body = {}) =>
    body.payment !== undefined ||
    body.paymentStatus !== undefined ||
    body["payment.status"] !== undefined ||
    body.paidAt !== undefined ||
    body.paid_at !== undefined;

function buildPayment({
    method,
    status = "Pending",
    amount = 0,
    paidAt = null,
    confirmedBy = null,
    note = "",
    providerId = null,
    extra = {},
}) {
    return {
        ...extra,
        method: normalizePaymentMethod(method),
        status: normalizePaymentStatus(status),
        amount: safeNumber(amount) ?? 0,
        paidAt,
        confirmedBy,
        ...(note ? { note } : {}),
        ...(providerId ? { providerId } : {}),
    };
}

function getPaymentStatus(payment) {
    return normalizePaymentStatus(payment?.status || "Pending");
}

function getPaymentMethod(payment) {
    return normalizePaymentMethod(payment?.method || "Online");
}

function resolveAdminIdentity(req) {
    const clerkUserId = resolveClerkUserId(req);
    if (clerkUserId) {
        return { id: clerkUserId, verifiedByClerk: true };
    }

    const headerAdminId = String(req.get("x-admin-id") || "").trim();
    if (headerAdminId) {
        return { id: headerAdminId, verifiedByClerk: false };
    }

    return { id: null, verifiedByClerk: false };
}

function validateAdminRequest(req, res) {
    if (!MAJOR_ADMIN_ID) {
        res.status(500).json({
            success: false,
            message: "Admin identity is not configured on the server."
        });
        return null;
    }

    const adminIdentity = resolveAdminIdentity(req);
    if (!adminIdentity.id) {
        res.status(401).json({
            success: false,
            message: "Admin authorization required."
        });
        return null;
    }

    if (String(adminIdentity.id) !== String(MAJOR_ADMIN_ID)) {
        res.status(403).json({
            success: false,
            message: "Only the configured admin can update cash payment status."
        });
        return null;
    }

    return adminIdentity;
}

// Build the base URL for frontend links, using environment variable or request headers
const buildFrontendBase = (req) => {
    if (FRONTEND_URL) return FRONTEND_URL.replace(/\/$/, "");
    const origin = req.get("origin") || req.get("referer");
    if (origin) return origin.replace(/\/$/, "");
    const host = req.get("host");
    if (host) return `${req.protocol || "http"}://${host}`.replace(/\/$/, "");
    return null;
};

// Resolve the user ID from the request, checking various properties and Clerk auth
function resolveClerkUserId(req) {
    try {
        const auth = typeof req.auth === "function" ? req.auth() : (req.auth || {});
        const fromReq = auth?.userId || auth?.user_id || auth?.user?.id || req.user?.id || null;
        if (fromReq) return fromReq;
        try {
            const serverAuth = getAuth ? getAuth(req) : null;
            return serverAuth?.userId || null;
        } catch (e) {
            return null;
        }
    } catch (e) {
        return null;
    }
}

// Helper to convert a Supabase appointment row to the same object format as before
function formatAppointment(row, doctorInfo = null) {
    const doctor = doctorInfo || (row.doctor ? row.doctor : null);
    return {
        _id: row.id,
        id: row.id,
        owner: row.owner,
        createdBy: row.created_by,
        patientName: row.patient_name,
        mobile: row.mobile,
        age: row.age,
        gender: row.gender,
        doctorId: doctor ? { _id: doctor.id, name: doctor.name, speciality: doctor.specialization } : row.doctor_id,
        doctorName: row.doctor_name || (doctor ? doctor.name : ""),
        speciality: row.speciality || (doctor ? doctor.specialization : ""),
        doctorImage: row.doctor_image || { url: "", publicId: "" },
        date: row.date,
        time: row.time,
        fees: row.fees,
        status: row.status,
        rescheduledTo: row.rescheduled_to,
        payment: row.payment,
        sessionId: row.session_id,
        paidAt: row.paid_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        notes: row.notes || "",
        patientEmail: row.patient_email || "",
    };
}

function isMissingColumnError(error, columnName) {
    const text = [error?.code, error?.message, error?.details, error?.hint]
        .filter(Boolean)
        .join(" ");

    return /column .* does not exist|could not find the .* column/i.test(text) &&
        text.toLowerCase().includes(String(columnName || "").toLowerCase());
}

async function tableSupportsColumn(tableName, columnName) {
    const cacheKey = `${tableName}.${columnName}`;
    if (columnSupportCache.has(cacheKey)) {
        return columnSupportCache.get(cacheKey);
    }

    const { error } = await supabase
        .from(tableName)
        .select(columnName)
        .limit(1);

    if (!error) {
        columnSupportCache.set(cacheKey, true);
        return true;
    }

    if (isMissingColumnError(error, columnName)) {
        if (!columnWarningCache.has(cacheKey)) {
            columnWarningCache.add(cacheKey);
            console.warn(`[appointments] ${cacheKey} is not available yet. Run the recommended SQL to enable patient email persistence.`);
        }
    } else {
        console.warn(`[appointments] Unable to verify ${cacheKey}:`, error?.message || error);
    }

    return false;
}

async function withPatientEmailIfSupported(payload, emailValue) {
    const patientEmail = normalizeOptionalEmail(emailValue);
    if (!patientEmail) return payload;

    const supportsPatientEmail = await tableSupportsColumn("appointments", "patient_email");
    if (!supportsPatientEmail) return payload;

    return {
        ...payload,
        patient_email: patientEmail,
    };
}

async function addPatientEmailToUpdatesIfSupported(updates, emailValue) {
    const patientEmail = normalizeOptionalEmail(emailValue);
    if (!patientEmail) return updates;

    const supportsPatientEmail = await tableSupportsColumn("appointments", "patient_email");
    if (!supportsPatientEmail) return updates;

    return {
        ...updates,
        patient_email: patientEmail,
    };
}

async function notifyAppointmentCreatedEmails(appointment, fallbackEmail = "") {
    const patientEmail = normalizeOptionalEmail(appointment?.patient_email || fallbackEmail);
    const adminEmail = getAdminNotifyEmail();
    const paymentMethod = appointment?.payment?.method || "Online";
    const commonPayload = {
        patientName: appointment?.patient_name || "",
        doctorName: appointment?.doctor_name || "",
        speciality: appointment?.speciality || "",
        date: appointment?.date || "",
        time: appointment?.time || "",
        fees: appointment?.fees ?? 0,
        paymentMethod,
        status: appointment?.status || "",
        mobile: appointment?.mobile || "",
        isOnlinePending:
            paymentMethod === "Online" &&
            normalizeAppointmentStatus(appointment?.status) === "Pending" &&
            Number(appointment?.fees || 0) > 0,
    };

    if (patientEmail) {
        await sendAppointmentCreatedEmail({
            to: patientEmail,
            ...commonPayload,
        });
    }

    if (adminEmail) {
        await sendAppointmentCreatedEmail({
            to: adminEmail,
            ...commonPayload,
            isAdminNotification: true,
        });
    }
}

async function notifyAppointmentStatusEmails({
    beforeAppointment,
    afterAppointment,
    fallbackEmail = "",
    notifyAdmin = false,
}) {
    const beforeStatus = normalizeAppointmentStatus(beforeAppointment?.status);
    const afterStatus = normalizeAppointmentStatus(afterAppointment?.status);
    const scheduleChanged =
        String(beforeAppointment?.date || "") !== String(afterAppointment?.date || "") ||
        String(beforeAppointment?.time || "") !== String(afterAppointment?.time || "") ||
        JSON.stringify(beforeAppointment?.rescheduled_to || null) !== JSON.stringify(afterAppointment?.rescheduled_to || null);

    if (!scheduleChanged && beforeStatus === afterStatus) {
        return;
    }

    const patientEmail = normalizeOptionalEmail(
        afterAppointment?.patient_email ||
        beforeAppointment?.patient_email ||
        fallbackEmail
    );
    const adminEmail = getAdminNotifyEmail();
    const commonPayload = {
        patientName: afterAppointment?.patient_name || beforeAppointment?.patient_name || "",
        doctorName: afterAppointment?.doctor_name || beforeAppointment?.doctor_name || "",
        speciality: afterAppointment?.speciality || beforeAppointment?.speciality || "",
        date: afterAppointment?.date || beforeAppointment?.date || "",
        time: afterAppointment?.time || beforeAppointment?.time || "",
        previousStatus: beforeStatus || "Unknown",
        newStatus: afterStatus || "Unknown",
        rescheduledDate: afterAppointment?.rescheduled_to?.date || "",
        rescheduledTime: afterAppointment?.rescheduled_to?.time || "",
        mobile: afterAppointment?.mobile || beforeAppointment?.mobile || "",
    };

    if (patientEmail) {
        await sendAppointmentStatusEmail({
            to: patientEmail,
            ...commonPayload,
        });
    }

    if (notifyAdmin && adminEmail) {
        await sendAppointmentStatusEmail({
            to: adminEmail,
            ...commonPayload,
            isAdminNotification: true,
        });
    }
}

function isUniqueViolation(error) {
    const haystack = [
        error?.code,
        error?.message,
        error?.details,
        error?.hint,
    ]
        .filter(Boolean)
        .join(" ");

    return error?.code === "23505" || /duplicate key value|unique constraint|unique_active_doctor_slot/i.test(haystack);
}

function createConflictError(message, originalError = null) {
    const error = new Error(message);
    error.statusCode = 409;
    error.originalError = originalError;
    return error;
}

async function isSlotAlreadyBooked(doctorId, date, time, excludeAppointmentId = null) {
    let query = supabase
        .from("appointments")
        .select("id")
        .eq("doctor_id", String(doctorId))
        .eq("date", String(date))
        .eq("time", String(time))
        .not("status", "in", CANCELED_STATUS_FILTER)
        .limit(1);

    if (excludeAppointmentId) {
        query = query.neq("id", excludeAppointmentId);
    }

    const { data, error } = await query;
    if (error) throw error;

    return Array.isArray(data) && data.length > 0;
}

async function insertAppointmentRecord(payload, conflictMessage = SLOT_JUST_BOOKED_MESSAGE) {
    const { data, error } = await supabase
        .from("appointments")
        .insert(payload)
        .select()
        .single();

    if (error) {
        if (isUniqueViolation(error)) {
            throw createConflictError(conflictMessage, error);
        }
        throw error;
    }

    return data;
}

async function getDoctorOwnedAppointment(appointmentId, doctorId) {
    const { data, error } = await supabase
        .from("appointments")
        .select("*")
        .eq("id", appointmentId)
        .eq("doctor_id", doctorId)
        .maybeSingle();

    return { data, error };
}

// To getAppointments (admin)
export const getAppointments = async (req, res) => {
    try {
        const { doctorId, mobile, status, search = "", limit: limitRaw = 50, page: pageRaw = 1, patientClerkId, createdBy } = req.query;
        const limit = Math.min(200, Math.max(1, parseInt(limitRaw, 10) || 50));
        const page = Math.max(1, parseInt(pageRaw, 10) || 1);
        const from = (page - 1) * limit;
        const to = from + limit - 1;

        let query = supabase.from('appointments').select(`
            *,
            doctor:doctor_id ( id, name, specialization )
        `, { count: 'exact' });

        // Apply filters
        if (doctorId) query = query.eq('doctor_id', doctorId);
        if (mobile) query = query.eq('mobile', mobile);
        if (status) query = query.eq('status', status);
        if (patientClerkId) query = query.eq('created_by', patientClerkId);
        if (createdBy) query = query.eq('created_by', createdBy);
        if (search) {
            query = query.or(`patient_name.ilike.%${search}%,mobile.ilike.%${search}%`);
        }

        const { data: appointments, count, error } = await query
            .order('created_at', { ascending: false })
            .range(from, to);

        if (error) throw error;

        const formatted = appointments.map(apt => formatAppointment(apt, apt.doctor));
        return res.json({
            success: true,
            appointments: formatted,
            meta: { page, limit, total: count, count: formatted.length }
        });
    } catch (err) {
        console.error("Get Appointments Error:", err);
        return res.status(500).json({
            success: false,
            message: "An error occurred while fetching appointments."
        });
    }
};

// To getAppointments by patient
export const getAppointmentsByPatient = async (req, res) => {
    try {
        const queryCreatedBy = req.query.createdBy || null;
        const clerkUserId = resolveClerkUserId(req);
        const resolvedCreatedBy = queryCreatedBy || clerkUserId || null;

        if (!resolvedCreatedBy && !req.query.mobile) {
            return res.json({
                success: true,
                appointments: [],
                data: []
            });
        }

        let query = supabase.from('appointments').select(`
            *,
            doctor:doctor_id ( id, name, specialization )
        `);

        if (resolvedCreatedBy) query = query.eq('created_by', resolvedCreatedBy);
        if (req.query.mobile) query = query.eq('mobile', req.query.mobile);

        const { data: appointments, error } = await query.order('date', { ascending: true }).order('time', { ascending: true });

        if (error) throw error;

        const formatted = appointments.map(apt => formatAppointment(apt, apt.doctor));
        return res.json({ success: true, appointments: formatted, data: formatted });
    } catch (err) {
        console.error("Get Appointments By Patient Error:", err);
        return res.status(500).json({
            success: false,
            message: "An error occurred while fetching appointments by patient."
        });
    }
};

// To create an appointment
export const createAppointment = async (req, res) => {
    try {
        const {
            doctorId,
            patientName,
            mobile,
            age = "",
            gender = "",
            date,
            time,
            fee,
            fees,
            notes = "",
            email,
            paymentMethod,
            owner: ownerFromBody = null,
            doctorName: doctorNameFromBody,
            speciality: specialityFromBody,
            doctorImageUrl: doctorImageUrlFromBody,
            doctorImagePublicId: doctorImagePublicIdFromBody,
        } = req.body || {};

        const clerkUserId = resolveClerkUserId(req);
        const normalizedPatientEmail = normalizeOptionalEmail(email);
        if (!clerkUserId) return res.status(401).json({
            success: false,
            message: "Unauthorized: Unable to resolve user identity."
        });

        const shouldLoadPatientProfile =
            !trimString(patientName) ||
            !trimString(mobile) ||
            age === undefined ||
            age === null ||
            age === "" ||
            !trimString(gender) ||
            !normalizedPatientEmail;

        const patientProfile = shouldLoadPatientProfile
            ? await fetchPatientProfileByClerkUserId(clerkUserId)
            : null;

        const resolvedPatientName = trimString(patientName) || patientProfile?.fullName || "";
        const resolvedMobile = trimString(mobile) || patientProfile?.mobile || "";
        const fallbackAge = patientProfile?.age ?? calculateAgeFromDateOfBirth(patientProfile?.dateOfBirth);
        const rawResolvedAge =
            age !== undefined && age !== null && age !== ""
                ? age
                : fallbackAge;
        const resolvedAge =
            rawResolvedAge === undefined || rawResolvedAge === null || rawResolvedAge === ""
                ? null
                : Number(rawResolvedAge);
        const resolvedGender = trimString(gender) || patientProfile?.gender || "";
        const resolvedPatientEmail = normalizeOptionalEmail(email || patientProfile?.email || "");
        const appointmentDate = String(date || "").trim();
        const appointmentTime = String(time || "").trim();

        if (!doctorId || !resolvedPatientName || !resolvedMobile || !appointmentDate || !appointmentTime) {
            return res.status(400).json({
                success: false,
                message: "Missing required fields: doctorId, patientName, mobile, date, and time are required."
            });
        }

        if (resolvedAge !== null && (!Number.isFinite(resolvedAge) || resolvedAge < 0 || resolvedAge > 120)) {
            return res.status(400).json({
                success: false,
                message: "Invalid age: Age must be a reasonable number."
            });
        }

        const numericFee = safeNumber(fee ?? fees ?? 0);
        if (numericFee === null || numericFee < 0) {
            return res.status(400).json({
                success: false,
                message: "Invalid fee: Fee must be a non-negative number."
            });
        }

        const normalizedDoctorId = String(doctorId);

        const slotAlreadyBooked = await isSlotAlreadyBooked(
            normalizedDoctorId,
            appointmentDate,
            appointmentTime
        );

        if (slotAlreadyBooked) {
            return res.status(409).json({
                success: false,
                message: SLOT_ALREADY_BOOKED_MESSAGE
            });
        }

        // Fetch doctor details
        let doctor = null;
        const { data: doctorData, error: doctorError } = await supabase
            .from('doctors')
            .select('id, name, specialization, image_url, image_public_id, fee')
            .eq('id', normalizedDoctorId)
            .maybeSingle();

        if (doctorError) console.warn("Doctor Lookup Failed:", doctorError?.message);
        doctor = doctorData;

        if (!doctor) return res.status(404).json({
            success: false,
            message: "Doctor not found with the provided doctorId."
        });

        // Resolve owner, names, images, etc.
        let resolvedOwner = ownerFromBody || null;
        if (!resolvedOwner) resolvedOwner = MAJOR_ADMIN_ID || String(doctorId);

        const doctorName = (doctor.name && String(doctor.name).trim()) || (doctorNameFromBody && String(doctorNameFromBody).trim()) || "";
        const speciality = (doctor.specialization && String(doctor.specialization).trim()) || (specialityFromBody && String(specialityFromBody).trim()) || "";

        const doctorImageUrl = (doctor.image_url && String(doctor.image_url).trim()) || (doctorImageUrlFromBody && String(doctorImageUrlFromBody).trim()) || "";
        const doctorImagePublicId = (doctor.image_public_id && String(doctor.image_public_id).trim()) || (doctorImagePublicIdFromBody && String(doctorImagePublicIdFromBody).trim()) || "";
        const doctorImage = { url: doctorImageUrl, publicId: doctorImagePublicId };

        const base = await withPatientEmailIfSupported({
            doctor_id: normalizedDoctorId,
            doctor_name: doctorName,
            speciality: speciality,
            doctor_image: doctorImage,
            patient_name: resolvedPatientName,
            mobile: resolvedMobile,
            age: resolvedAge,
            gender: resolvedGender,
            date: appointmentDate,
            time: appointmentTime,
            fees: numericFee,
            status: "Pending",
            payment: buildPayment({
                method: paymentMethod,
                status: "Pending",
                amount: numericFee,
            }),
            created_by: clerkUserId,
            owner: resolvedOwner,
            session_id: null,
        }, resolvedPatientEmail);

        // Free appointments have no collection step. They are confirmed immediately,
        // while paid cash appointments remain Pending until the admin records payment.
        if (numericFee === 0) {
            const paidAt = new Date().toISOString();
            const created = await insertAppointmentRecord({
                ...base,
                status: "Confirmed",
                payment: buildPayment({
                    method: base.payment.method,
                    status: "Paid",
                    amount: 0,
                    paidAt,
                }),
                paid_at: paidAt,
            });
            await notifyAppointmentCreatedEmails(created, resolvedPatientEmail);
            return res.status(201).json({ success: true, appointment: formatAppointment(created), checkoutUrl: null });
        }

        // Cash payment
        if (paymentMethod === "Cash") {
            const created = await insertAppointmentRecord(base);
            await notifyAppointmentCreatedEmails(created, resolvedPatientEmail);
            return res.status(201).json({ success: true, appointment: formatAppointment(created), checkoutUrl: null });
        }

        // Online: Stripe
        if (!stripe) return res.status(500).json({ success: false, message: "Stripe not configured on server" });

        const frontBase = buildFrontendBase(req);
        if (!frontBase) {
            return res.status(500).json({ success: false, message: "Frontend URL could not be determined. Set FRONTEND_URL or send Origin header." });
        }

        const successUrl = `${frontBase}/appointment/success?session_id={CHECKOUT_SESSION_ID}`;
        const cancelUrl = `${frontBase}/appointment/cancel`;

        const stripeUnitAmount = toStripeUnitAmount(numericFee);

        let session;
        try {
            session = await stripe.checkout.sessions.create({
                payment_method_types: ["card"],
                mode: "payment",
                customer_email: resolvedPatientEmail || undefined,
                line_items: [
                    {
                        price_data: {
                            currency: STRIPE_CURRENCY,
                            product_data: { name: `Appointment - ${String(patientName).slice(0, 40)}` },
                            unit_amount: stripeUnitAmount,
                        },
                        quantity: 1,
                    },
                ],
                success_url: successUrl,
                cancel_url: cancelUrl,
                metadata: {
                    doctorId: String(doctorId),
                    doctorName: doctorName || "",
                    speciality: speciality || "",
                    patientName: base.patient_name,
                    mobile: base.mobile,
                    clerkUserId: clerkUserId || "",
                    currency: STRIPE_CURRENCY,
                },
            });
        } catch (stripeErr) {
            console.error("Stripe create session error:", stripeErr);
            const message = stripeErr?.raw?.message || stripeErr?.message || "Stripe error";
            return res.status(502).json({ success: false, message: `Payment provider error: ${message}` });
        }

        try {
            const created = await insertAppointmentRecord({
                ...base,
                session_id: session.id,
                payment: buildPayment({
                    method: "Online",
                    status: "Pending",
                    amount: numericFee,
                    providerId: session.payment_intent || session.paymentIntent || null,
                    extra: { ...base.payment, currency: STRIPE_CURRENCY },
                }),
                status: "Pending",
            });
            await notifyAppointmentCreatedEmails(created, resolvedPatientEmail);
            return res.status(201).json({ success: true, appointment: formatAppointment(created), checkoutUrl: session.url || null });
        } catch (dbErr) {
            if (dbErr?.statusCode === 409) {
                throw dbErr;
            }
            console.error("DB error saving appointment after stripe session:", dbErr);
            return res.status(500).json({ success: false, message: "Failed to create appointment record" });
        }
    } catch (err) {
        if (err?.statusCode === 409) {
            return res.status(409).json({ success: false, message: err.message });
        }
        console.error("createAppointment unexpected:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

// To confirm the online payment and make it paid
export const confirmPayment = async (req, res) => {
    try {
        const { session_id } = req.query;
        if (!session_id) return res.status(400).json({
            success: false,
            message: "Missing session_id in query parameters."
        });

        if (!stripe) return res.status(500).json({
            success: false,
            message: "Stripe not configured on server."
        });

        let session;
        try {
            session = await stripe.checkout.sessions.retrieve(session_id);
        } catch (err) {
            console.error("Stripe retrieve session error:", err);
            return res.status(404).json({
                success: false,
                message: "Payment session not found."
            });
        }

        if (!session) return res.status(404).json({
            success: false,
            message: "Payment session not found."
        });

        if (session.payment_status !== "paid") {
            return res.status(400).json({
                success: false,
                message: "Payment not completed for this session."
            });
        }

        const paidAt = new Date().toISOString();
        const currency = normalizeStripeCurrency(session.currency || session.metadata?.currency || STRIPE_CURRENCY);
        const paidAmount = fromStripeUnitAmount(session.amount_total || 0, currency);
        const paidPayment = buildPayment({
            method: "Online",
            status: "Paid",
            amount: paidAmount,
            paidAt,
            providerId: session.payment_intent || null,
            extra: { currency },
        });

        // Try match by sessionId first
        let { data: appt, error: updateError } = await supabase
            .from('appointments')
            .update({
                payment: paidPayment,
                status: "Confirmed",
                paid_at: paidAt,
            })
            .eq('session_id', session_id)
            .select()
            .maybeSingle();

        if (updateError) throw updateError;

        // fallback: try match via metadata (doctorId + mobile + patientName)
        if (!appt) {
            const meta = session.metadata || {};
            if (meta.doctorId && meta.mobile && meta.patientName) {
                const { data: fallbackAppt, error: fallbackError } = await supabase
                    .from('appointments')
                    .update({
                        payment: paidPayment,
                        status: "Confirmed",
                        paid_at: paidAt,
                        session_id: session_id,
                    })
                    .eq('doctor_id', meta.doctorId)
                    .eq('mobile', meta.mobile)
                    .eq('patient_name', meta.patientName)
                    .eq('fees', paidAmount)
                    .select()
                    .maybeSingle();
                if (fallbackError) throw fallbackError;
                appt = fallbackAppt;
            }
        }

        // last attempt: find appointment created in last 15 minutes with matching amount
        if (!appt) {
            const amount = paidAmount;
            const fifteenAgo = new Date(Date.now() - 1000 * 60 * 15).toISOString();
            const { data: recentAppt, error: recentError } = await supabase
                .from('appointments')
                .update({
                    payment: paidPayment,
                    status: "Confirmed",
                    paid_at: paidAt,
                    session_id: session_id,
                })
                .eq('fees', amount)
                .gte('created_at', fifteenAgo)
                .select()
                .maybeSingle();
            if (recentError) throw recentError;
            appt = recentAppt;
        }

        if (!appt) {
            return res.status(404).json({ success: false, message: "Appointment not found for this payment session" });
        }

        const formatted = formatAppointment(appt);
        return res.json({ success: true, appointment: formatted, data: formatted });
    } catch (err) {
        console.error("confirmPayment unexpected:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

// To update an appointment
export const updateAppointment = async (req, res) => {
    try {
        const { id } = req.params;
        const body = req.body || {};

        // Fetch current appointment
        const { data: appt, error: fetchError } = await supabase
            .from('appointments')
            .select('*')
            .eq('id', id)
            .single();

        if (fetchError) {
            if (fetchError.code === 'PGRST116') {
                return res.status(404).json({ success: false, message: "Appointment not found with the provided id." });
            }
            throw fetchError;
        }

        const terminal = isTerminalAppointmentStatus(appt.status);
        if (terminal && body.status && normalizeAppointmentStatus(body.status) !== normalizeAppointmentStatus(appt.status)) {
            return res.status(400).json({ success: false, message: "Cannot change status of a completed/canceled appointment" });
        }
        if (hasPaymentMutation(body)) {
            return res.status(400).json({
                success: false,
                message: "Use the admin cash payment endpoint to update payment status."
            });
        }

        const updates = {};
        if (body.status) updates.status = body.status;
        const fallbackPatientEmail = normalizeOptionalEmail(body.patientEmail || body.email);

        if (body.date && body.time) {
            if (terminal) {
                return res.status(400).json({ success: false, message: "Cannot reschedule completed/canceled appointment" });
            }
            const nextDate = String(body.date).trim();
            const nextTime = String(body.time).trim();
            const slotAlreadyBooked = await isSlotAlreadyBooked(
                appt.doctor_id,
                nextDate,
                nextTime,
                id
            );

            if (slotAlreadyBooked) {
                return res.status(409).json({
                    success: false,
                    message: SLOT_ALREADY_BOOKED_MESSAGE
                });
            }

            updates.date = nextDate;
            updates.time = nextTime;
            updates.status = "Rescheduled";
            updates.rescheduled_to = { date: nextDate, time: nextTime };
        }

        const finalUpdates = await addPatientEmailToUpdatesIfSupported(updates, fallbackPatientEmail);

        const { data: updated, error: updateError } = await supabase
            .from('appointments')
            .update(finalUpdates)
            .eq('id', id)
            .select(`
                *,
                doctor:doctor_id ( id, name, specialization, image_url )
            `)
            .single();

        if (updateError) {
            if (isUniqueViolation(updateError)) {
                return res.status(409).json({ success: false, message: SLOT_JUST_BOOKED_MESSAGE });
            }
            throw updateError;
        }

        await notifyAppointmentStatusEmails({
            beforeAppointment: appt,
            afterAppointment: updated,
            fallbackEmail: fallbackPatientEmail,
        });

        return res.json({ success: true, appointment: formatAppointment(updated, updated.doctor) });
    } catch (err) {
        console.error("updateAppointment unexpected:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

// To cancel an appointment
export const cancelAppointment = async (req, res) => {
    try {
        const { id } = req.params;

        const { data: appt, error: fetchError } = await supabase
            .from('appointments')
            .select('*')
            .eq('id', id)
            .single();

        if (fetchError) {
            if (fetchError.code === 'PGRST116') {
                return res.status(404).json({ success: false, message: "Appointment not found with the provided id." });
            }
            throw fetchError;
        }

        if (isCompletedStatus(appt.status)) {
            return res.status(400).json({
                success: false,
                message: "Cannot cancel a completed appointment"
            });
        }

        if (isCanceledStatus(appt.status)) {
            return res.json({ success: true, appointment: formatAppointment(appt), message: "Appointment is already canceled." });
        }

        const { data: updated, error: updateError } = await supabase
            .from('appointments')
            .update({ status: "Canceled" })
            .eq('id', id)
            .select()
            .single();

        if (updateError) throw updateError;

        await notifyAppointmentStatusEmails({
            beforeAppointment: appt,
            afterAppointment: updated,
            notifyAdmin: true,
        });

        return res.json({ success: true, appointment: formatAppointment(updated) });
    } catch (err) {
        console.error("cancelAppointment unexpected:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

export const updateCashPaymentStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { paymentStatus, note = "" } = req.body || {};
        const requestedStatus = normalizePaymentStatus(paymentStatus);
        const adminIdentity = validateAdminRequest(req, res);

        if (!adminIdentity) return;

        if (requestedStatus !== "Paid") {
            return res.status(400).json({
                success: false,
                message: "Only marking cash payments as Paid is supported by this endpoint."
            });
        }

        const { data: appt, error: fetchError } = await supabase
            .from("appointments")
            .select("*")
            .eq("id", id)
            .maybeSingle();

        if (fetchError) throw fetchError;
        if (!appt) {
            return res.status(404).json({
                success: false,
                message: "Appointment not found with the provided id."
            });
        }

        const currentPayment = appt.payment || {};
        if (getPaymentMethod(currentPayment) !== "Cash") {
            return res.status(400).json({
                success: false,
                message: "Only cash appointment payments can be manually marked as paid."
            });
        }

        if (getPaymentStatus(currentPayment) === "Paid") {
            return res.json({
                success: true,
                message: "Cash payment is already marked as paid.",
                appointment: formatAppointment(appt)
            });
        }

        if (isCanceledStatus(appt.status) || isDeclinedStatus(appt.status)) {
            return res.status(400).json({
                success: false,
                message: "Cannot mark payment as paid for a canceled or declined appointment."
            });
        }

        const paidAt = new Date().toISOString();
        const updatedPayment = buildPayment({
            method: "Cash",
            status: "Paid",
            amount: currentPayment.amount ?? appt.fees ?? 0,
            paidAt,
            confirmedBy: adminIdentity.id,
            note: String(note || "").trim(),
            extra: currentPayment,
        });

        const { data: updated, error: updateError } = await supabase
            .from("appointments")
            .update({
                payment: updatedPayment,
                paid_at: paidAt,
            })
            .eq("id", id)
            .select(`
                *,
                doctor:doctor_id ( id, name, specialization, image_url )
            `)
            .single();

        if (updateError) throw updateError;

        try {
            const patientEmail = normalizeOptionalEmail(updated.patient_email || "");
            if (patientEmail) {
                await sendCashPaymentConfirmedEmail({
                    to: patientEmail,
                    patientName: updated.patient_name || "",
                    doctorName: updated.doctor_name || updated.doctor?.name || "",
                    speciality: updated.speciality || updated.doctor?.specialization || "",
                    date: updated.date || "",
                    time: updated.time || "",
                    amount: updatedPayment.amount,
                    paidAt,
                    note: updatedPayment.note || "",
                });
            }
        } catch (emailError) {
            console.warn("Cash payment confirmation email failed:", emailError?.message || emailError);
        }

        return res.json({
            success: true,
            message: "Cash payment marked as paid.",
            appointment: formatAppointment(updated, updated.doctor)
        });
    } catch (err) {
        console.error("updateCashPaymentStatus unexpected:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

// To get Stats
export const getStats = async (req, res) => {
    try {
        // Total appointments count
        const { count: total, error: totalError } = await supabase
            .from('appointments')
            .select('*', { count: 'exact', head: true });

        if (totalError) throw totalError;

        // Sum of fees where payment.status = 'Paid'
        const { data: paidData, error: paidError } = await supabase
            .from('appointments')
            .select('fees')
            .eq('payment->>status', 'Paid');

        if (paidError) throw paidError;
        const revenue = paidData.reduce((sum, row) => sum + (row.fees || 0), 0);

        // Count appointments in last 7 days
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const { count: recent, error: recentError } = await supabase
            .from('appointments')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', sevenDaysAgo.toISOString());

        if (recentError) throw recentError;

        return res.json({
            success: true,
            stats: { total, revenue, recentLast7Days: recent }
        });
    } catch (err) {
        console.error("getStats unexpected:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

// To get Appointment by Doctor
export const getAppointmentsByDoctor = async (req, res) => {
    try {
        const { doctorId } = req.params;
        if (!doctorId) return res.status(400).json({
            success: false,
            message: "Missing doctorId in request parameters."
        });

        const { mobile, status, search = "", limit: limitRaw = 50, page: pageRaw = 1 } = req.query;
        const limit = Math.min(200, Math.max(1, parseInt(limitRaw, 10) || 50));
        const page = Math.max(1, parseInt(pageRaw, 10) || 1);
        const from = (page - 1) * limit;
        const to = from + limit - 1;

        let query = supabase.from('appointments').select(`
            *,
            doctor:doctor_id ( id, name, specialization, image_url )
        `, { count: 'exact' }).eq('doctor_id', doctorId);

        if (mobile) query = query.eq('mobile', mobile);
        if (status) query = query.eq('status', status);
        if (search) {
            query = query.or(`patient_name.ilike.%${search}%,mobile.ilike.%${search}%`);
        }

        const { data: appointments, count, error } = await query
            .order('date', { ascending: true })
            .order('time', { ascending: true })
            .range(from, to);

        if (error) throw error;

        const formatted = appointments.map(apt => formatAppointment(apt, apt.doctor));
        return res.json({
            success: true,
            appointments: formatted,
            meta: { page, limit, total: count, count: formatted.length }
        });
    } catch (err) {
        console.error("getAppointmentsByDoctor unexpected:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

export const getAppointmentsForAuthenticatedDoctor = async (req, res) => {
    try {
        const doctorId = req.doctor?.id;
        if (!doctorId) {
            return res.status(401).json({
                success: false,
                message: "Doctor authorization required."
            });
        }

        const { mobile, status, search = "", limit: limitRaw = 50, page: pageRaw = 1 } = req.query;
        const limit = Math.min(200, Math.max(1, parseInt(limitRaw, 10) || 50));
        const page = Math.max(1, parseInt(pageRaw, 10) || 1);
        const from = (page - 1) * limit;
        const to = from + limit - 1;

        let query = supabase.from("appointments").select(`
            *,
            doctor:doctor_id ( id, name, specialization, image_url )
        `, { count: "exact" }).eq("doctor_id", doctorId);

        if (mobile) query = query.eq("mobile", mobile);
        if (status) query = query.eq("status", status);
        if (search) {
            query = query.or(`patient_name.ilike.%${search}%,mobile.ilike.%${search}%`);
        }

        const { data: appointments, count, error } = await query
            .order("date", { ascending: true })
            .order("time", { ascending: true })
            .range(from, to);

        if (error) throw error;

        const formatted = appointments.map((apt) => formatAppointment(apt, apt.doctor));
        return res.json({
            success: true,
            appointments: formatted,
            data: formatted,
            meta: { page, limit, total: count, count: formatted.length }
        });
    } catch (err) {
        console.error("getAppointmentsForAuthenticatedDoctor unexpected:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

export const updateDoctorAppointment = async (req, res) => {
    try {
        const doctorId = req.doctor?.id;
        const { id } = req.params;
        const body = req.body || {};

        if (!doctorId) {
            return res.status(401).json({
                success: false,
                message: "Doctor authorization required."
            });
        }

        const { data: appt, error: fetchError } = await getDoctorOwnedAppointment(id, doctorId);

        if (fetchError) throw fetchError;
        if (!appt) {
            return res.status(404).json({
                success: false,
                message: "Appointment not found for this doctor."
            });
        }

        const terminal = isTerminalAppointmentStatus(appt.status);
        if (terminal && body.status && normalizeAppointmentStatus(body.status) !== normalizeAppointmentStatus(appt.status)) {
            return res.status(400).json({
                success: false,
                message: "Cannot change status of a completed/canceled appointment"
            });
        }
        if (hasPaymentMutation(body)) {
            return res.status(400).json({
                success: false,
                message: "Doctors cannot update payment status."
            });
        }

        const updates = {};
        if (body.status) updates.status = body.status;
        const fallbackPatientEmail = normalizeOptionalEmail(body.patientEmail || body.email);

        if (body.date && body.time) {
            if (terminal) {
                return res.status(400).json({
                    success: false,
                    message: "Cannot reschedule completed/canceled appointment"
                });
            }
            const nextDate = String(body.date).trim();
            const nextTime = String(body.time).trim();
            const slotAlreadyBooked = await isSlotAlreadyBooked(
                doctorId,
                nextDate,
                nextTime,
                id
            );

            if (slotAlreadyBooked) {
                return res.status(409).json({
                    success: false,
                    message: SLOT_ALREADY_BOOKED_MESSAGE
                });
            }

            updates.date = nextDate;
            updates.time = nextTime;
            updates.status = "Rescheduled";
            updates.rescheduled_to = { date: nextDate, time: nextTime };
        }

        const finalUpdates = await addPatientEmailToUpdatesIfSupported(updates, fallbackPatientEmail);

        const { data: updated, error: updateError } = await supabase
            .from("appointments")
            .update(finalUpdates)
            .eq("id", id)
            .eq("doctor_id", doctorId)
            .select(`
                *,
                doctor:doctor_id ( id, name, specialization, image_url )
            `)
            .single();

        if (updateError) {
            if (isUniqueViolation(updateError)) {
                return res.status(409).json({ success: false, message: SLOT_JUST_BOOKED_MESSAGE });
            }
            throw updateError;
        }

        await notifyAppointmentStatusEmails({
            beforeAppointment: appt,
            afterAppointment: updated,
            fallbackEmail: fallbackPatientEmail,
        });

        return res.json({ success: true, appointment: formatAppointment(updated, updated.doctor) });
    } catch (err) {
        console.error("updateDoctorAppointment unexpected:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

export const cancelDoctorAppointment = async (req, res) => {
    try {
        const doctorId = req.doctor?.id;
        const { id } = req.params;

        if (!doctorId) {
            return res.status(401).json({
                success: false,
                message: "Doctor authorization required."
            });
        }

        const { data: appt, error: fetchError } = await getDoctorOwnedAppointment(id, doctorId);

        if (fetchError) throw fetchError;
        if (!appt) {
            return res.status(404).json({
                success: false,
                message: "Appointment not found for this doctor."
            });
        }

        if (isCompletedStatus(appt.status)) {
            return res.status(400).json({
                success: false,
                message: "Cannot cancel a completed appointment"
            });
        }

        const { data: updated, error: updateError } = await supabase
            .from("appointments")
            .update({ status: "Canceled" })
            .eq("id", id)
            .eq("doctor_id", doctorId)
            .select(`
                *,
                doctor:doctor_id ( id, name, specialization, image_url )
            `)
            .single();

        if (updateError) throw updateError;

        await notifyAppointmentStatusEmails({
            beforeAppointment: appt,
            afterAppointment: updated,
            notifyAdmin: true,
        });

        return res.json({ success: true, appointment: formatAppointment(updated, updated.doctor) });
    } catch (err) {
        console.error("cancelDoctorAppointment unexpected:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

// To get Registered user count (via Clerk)
export async function getRegisteredUserCount(req, res) {
    try {
        const totalUsers = await clerkClient.users.getCount();
        return res.json({ success: true, totalUsers });
    } catch (err) {
        console.error("getRegisteredUserCount unexpected:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
}

export default {
    getAppointments,
    getAppointmentsByPatient,
    createAppointment,
    confirmPayment,
    updateAppointment,
    updateCashPaymentStatus,
    cancelAppointment,
    getStats,
    getAppointmentsByDoctor,
    getAppointmentsForAuthenticatedDoctor,
    updateDoctorAppointment,
    cancelDoctorAppointment,
    getRegisteredUserCount
};
