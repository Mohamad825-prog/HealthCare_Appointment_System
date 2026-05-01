const DOCTOR_TOKEN_STORAGE_KEY = "doctorToken_v1";
const DOCTOR_PROFILE_STORAGE_KEY = "doctorProfile_v1";
const DOCTOR_AUTH_EVENT = "doctor-auth-change";

export {
    DOCTOR_TOKEN_STORAGE_KEY,
    DOCTOR_PROFILE_STORAGE_KEY,
    DOCTOR_AUTH_EVENT,
};

export const normalizeDoctorProfile = (doctor = {}) => {
    const imageUrl = doctor.image_url || doctor.imageUrl || "";

    return {
        id: doctor.id || doctor._id || "",
        _id: doctor._id || doctor.id || "",
        email: doctor.email || "",
        name: doctor.name || "",
        specialization: doctor.specialization || doctor.speciality || "",
        image_url: imageUrl,
        imageUrl,
        availability: doctor.availability ?? "Available",
        experience: doctor.experience || "",
        qualifications: doctor.qualifications || "",
        location: doctor.location || "",
        about: doctor.about || "",
        fee: doctor.fee ?? doctor.fees ?? 0,
        schedule: doctor.schedule || {},
        success: doctor.success || "",
        patients: doctor.patients || "",
        rating: doctor.rating ?? 0,
    };
};

const readStorage = (key) => {
    if (typeof window === "undefined") return null;

    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
};

const writeStorage = (key, value) => {
    if (typeof window === "undefined") return;

    try {
        window.localStorage.setItem(key, value);
    } catch {
        // Ignore storage write issues.
    }
};

const removeStorage = (key) => {
    if (typeof window === "undefined") return;

    try {
        window.localStorage.removeItem(key);
    } catch {
        // Ignore storage removal issues.
    }
};

export const getDoctorToken = () => readStorage(DOCTOR_TOKEN_STORAGE_KEY) || "";

export const getDoctorProfile = () => {
    const raw = readStorage(DOCTOR_PROFILE_STORAGE_KEY);
    if (!raw) return null;

    try {
        return normalizeDoctorProfile(JSON.parse(raw));
    } catch {
        return null;
    }
};

export const isDoctorAuthenticated = () => Boolean(getDoctorToken());

export const setDoctorSession = ({ token, doctor }) => {
    const normalizedDoctor = normalizeDoctorProfile(doctor);

    writeStorage(DOCTOR_TOKEN_STORAGE_KEY, token || "");
    writeStorage(DOCTOR_PROFILE_STORAGE_KEY, JSON.stringify(normalizedDoctor));
    notifyDoctorAuthChange({ token: token || "", doctor: normalizedDoctor });

    return normalizedDoctor;
};

export const setDoctorStoredProfile = (doctor) => {
    const normalizedDoctor = normalizeDoctorProfile(doctor);
    const token = getDoctorToken();

    writeStorage(DOCTOR_PROFILE_STORAGE_KEY, JSON.stringify(normalizedDoctor));
    notifyDoctorAuthChange({ token, doctor: normalizedDoctor });

    return normalizedDoctor;
};

export const clearDoctorSession = () => {
    removeStorage(DOCTOR_TOKEN_STORAGE_KEY);
    removeStorage(DOCTOR_PROFILE_STORAGE_KEY);
    notifyDoctorAuthChange({ token: "", doctor: null });
};

export const notifyDoctorAuthChange = (detail = {}) => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(DOCTOR_AUTH_EVENT, { detail }));
};
