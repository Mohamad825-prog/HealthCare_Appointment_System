import { getAuth } from "@clerk/express";
import { supabase } from "../config/supabase.js";
import {
    calculateAgeFromDateOfBirth,
    fetchPatientProfileByClerkUserId,
    normalizeOptionalEmail,
    normalizeOptionalPhone,
    normalizePatientProfileRecord,
    trimString,
} from "../utils/patientProfile.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const resolveClerkUserId = (req) => {
    try {
        const auth = typeof req.auth === "function" ? req.auth() : (req.auth || {});
        const fromReq = auth?.userId || auth?.user_id || auth?.user?.id || req.user?.id || null;
        if (fromReq) return fromReq;
        const serverAuth = getAuth ? getAuth(req) : null;
        return serverAuth?.userId || null;
    } catch {
        return null;
    }
};

const safeInteger = (value) => {
    if (value === undefined || value === null || value === "") return null;
    const parsed = Number.parseInt(String(value), 10);
    return Number.isFinite(parsed) ? parsed : null;
};

const isMissingPatientProfilesTableError = (error) => {
    const text = [error?.code, error?.message, error?.details, error?.hint]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

    return (
        /relation .* does not exist|could not find the table/i.test(text) &&
        text.includes("patient_profiles")
    );
};

export async function getMyPatientProfile(req, res) {
    try {
        const clerkUserId = resolveClerkUserId(req);
        if (!clerkUserId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }

        const profile = await fetchPatientProfileByClerkUserId(clerkUserId);
        return res.json({
            success: true,
            data: profile,
        });
    } catch (error) {
        if (isMissingPatientProfilesTableError(error)) {
            return res.status(500).json({
                success: false,
                message: "Patient profile table is not configured yet.",
            });
        }

        console.error("getMyPatientProfile unexpected:", error);
        return res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
}

export async function upsertMyPatientProfile(req, res) {
    try {
        const clerkUserId = resolveClerkUserId(req);
        if (!clerkUserId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }

        const body = req.body || {};
        const fullName = trimString(body.fullName ?? body.full_name);
        const emailRaw = trimString(body.email);
        const email = normalizeOptionalEmail(emailRaw);
        const mobile = normalizeOptionalPhone(body.mobile);
        const gender = trimString(body.gender);
        const address = trimString(body.address);
        const emergencyContactName = trimString(body.emergencyContactName ?? body.emergency_contact_name);
        const emergencyContactPhone = normalizeOptionalPhone(body.emergencyContactPhone ?? body.emergency_contact_phone);
        const dateOfBirth = trimString(body.dateOfBirth ?? body.date_of_birth);
        const age = safeInteger(body.age);

        if (!fullName) {
            return res.status(400).json({
                success: false,
                message: "Full name is required.",
            });
        }

        if (fullName.length < 2 || fullName.length > 120) {
            return res.status(400).json({
                success: false,
                message: "Full name must be between 2 and 120 characters.",
            });
        }

        if (emailRaw && !EMAIL_REGEX.test(emailRaw)) {
            return res.status(400).json({
                success: false,
                message: "Please provide a valid email address.",
            });
        }

        if (mobile && (mobile.length < 7 || mobile.length > 20)) {
            return res.status(400).json({
                success: false,
                message: "Mobile phone must be between 7 and 20 characters.",
            });
        }

        if (age !== null && (age < 0 || age > 120)) {
            return res.status(400).json({
                success: false,
                message: "Age must be between 0 and 120.",
            });
        }

        if (dateOfBirth) {
            if (!DATE_REGEX.test(dateOfBirth)) {
                return res.status(400).json({
                    success: false,
                    message: "Date of birth must use YYYY-MM-DD format.",
                });
            }

            const derivedAge = calculateAgeFromDateOfBirth(dateOfBirth);
            if (derivedAge === null) {
                return res.status(400).json({
                    success: false,
                    message: "Date of birth must be a valid past date.",
                });
            }
        }

        if (gender && gender.length > 50) {
            return res.status(400).json({
                success: false,
                message: "Gender must be 50 characters or fewer.",
            });
        }

        if (address && address.length > 250) {
            return res.status(400).json({
                success: false,
                message: "Address must be 250 characters or fewer.",
            });
        }

        if (emergencyContactName && emergencyContactName.length > 120) {
            return res.status(400).json({
                success: false,
                message: "Emergency contact name must be 120 characters or fewer.",
            });
        }

        if (emergencyContactPhone && (emergencyContactPhone.length < 7 || emergencyContactPhone.length > 20)) {
            return res.status(400).json({
                success: false,
                message: "Emergency contact phone must be between 7 and 20 characters.",
            });
        }

        const payload = {
            clerk_user_id: clerkUserId,
            full_name: fullName,
            email: email || null,
            mobile: mobile || null,
            age,
            date_of_birth: dateOfBirth || null,
            gender: gender || null,
            address: address || null,
            emergency_contact_name: emergencyContactName || null,
            emergency_contact_phone: emergencyContactPhone || null,
        };

        const { data, error } = await supabase
            .from("patient_profiles")
            .upsert(payload, {
                onConflict: "clerk_user_id",
            })
            .select("*")
            .single();

        if (error) {
            throw error;
        }

        return res.json({
            success: true,
            data: normalizePatientProfileRecord(data),
        });
    } catch (error) {
        if (isMissingPatientProfilesTableError(error)) {
            return res.status(500).json({
                success: false,
                message: "Patient profile table is not configured yet.",
            });
        }

        console.error("upsertMyPatientProfile unexpected:", error);
        return res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
}

export default {
    getMyPatientProfile,
    upsertMyPatientProfile,
};
