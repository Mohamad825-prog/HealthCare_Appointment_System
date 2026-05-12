import { supabase } from "../config/supabase.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const warnedKeys = new Set();

const warnOnce = (key, message) => {
    if (warnedKeys.has(key)) return;
    warnedKeys.add(key);
    console.warn(message);
};

export const trimString = (value) => {
    if (value == null) return "";
    return String(value).trim();
};

export const normalizeOptionalEmail = (value) => {
    const email = trimString(value).toLowerCase();
    return EMAIL_REGEX.test(email) ? email : "";
};

export const normalizeOptionalPhone = (value) => trimString(value);

export const calculateAgeFromDateOfBirth = (dateOfBirth) => {
    const raw = trimString(dateOfBirth);
    if (!raw) return null;

    const date = new Date(`${raw}T00:00:00`);
    if (Number.isNaN(date.getTime())) return null;

    const today = new Date();
    let age = today.getFullYear() - date.getFullYear();
    const monthDelta = today.getMonth() - date.getMonth();
    const dayDelta = today.getDate() - date.getDate();

    if (monthDelta < 0 || (monthDelta === 0 && dayDelta < 0)) {
        age -= 1;
    }

    if (age < 0 || age > 120) return null;
    return age;
};

export const normalizePatientProfileRecord = (row = null) => {
    if (!row) return null;

    return {
        id: row.id,
        clerkUserId: row.clerk_user_id || "",
        fullName: row.full_name || "",
        email: row.email || "",
        mobile: row.mobile || "",
        age: row.age ?? null,
        dateOfBirth: row.date_of_birth || "",
        gender: row.gender || "",
        address: row.address || "",
        emergencyContactName: row.emergency_contact_name || "",
        emergencyContactPhone: row.emergency_contact_phone || "",
        createdAt: row.created_at || null,
        updatedAt: row.updated_at || null,
    };
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

export async function fetchPatientProfileByClerkUserId(clerkUserId) {
    const normalizedClerkUserId = trimString(clerkUserId);
    if (!normalizedClerkUserId) return null;

    const { data, error } = await supabase
        .from("patient_profiles")
        .select("*")
        .eq("clerk_user_id", normalizedClerkUserId)
        .maybeSingle();

    if (!error) {
        return normalizePatientProfileRecord(data);
    }

    if (error.code === "PGRST116") {
        return null;
    }

    if (isMissingPatientProfilesTableError(error)) {
        warnOnce(
            "patient-profiles-table-missing",
            "[patient-profiles] public.patient_profiles does not exist yet. Run the recommended SQL to enable patient profile storage."
        );
        return null;
    }

    throw error;
}
