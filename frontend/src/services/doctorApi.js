import { getDoctorToken, normalizeDoctorProfile } from "../utils/doctorAuth";

const API_BASE = "http://localhost:4000";

class DoctorApiError extends Error {
    constructor(message, status, data) {
        super(message);
        this.name = "DoctorApiError";
        this.status = status;
        this.data = data;
    }
}

const parseJsonSafely = async (response) => {
    try {
        return await response.json();
    } catch {
        return {};
    }
};

const doctorRequest = async (path, options = {}) => {
    const token = getDoctorToken();
    const isFormData =
        typeof FormData !== "undefined" && options.body instanceof FormData;
    const baseHeaders = {
        ...(isFormData ? {} : { "Content-Type": "application/json" }),
        ...(options.headers || {}),
    };

    if (token) {
        baseHeaders.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: baseHeaders,
    });

    const body = await parseJsonSafely(response);

    if (!response.ok || body.success === false) {
        throw new DoctorApiError(
            body?.message || `Request failed (${response.status})`,
            response.status,
            body
        );
    }

    return body;
};

export const loginDoctor = async ({ email, password }) => {
    const body = await doctorRequest("/api/doctors/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
    });

    return {
        success: Boolean(body.success),
        token: body.token || "",
        doctor: normalizeDoctorProfile(body.data || {}),
        raw: body,
    };
};

export const fetchDoctorAppointments = async (query = {}) => {
    const params = new URLSearchParams();

    Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
            params.set(key, String(value));
        }
    });

    const suffix = params.toString() ? `?${params.toString()}` : "";
    const body = await doctorRequest(`/api/appointments/doctor/me${suffix}`);

    return {
        appointments: Array.isArray(body.appointments)
            ? body.appointments
            : Array.isArray(body.data)
                ? body.data
                : [],
        meta: body.meta || {},
        raw: body,
    };
};

export const updateDoctorAppointment = async (appointmentId, payload) => {
    const body = await doctorRequest(`/api/appointments/doctor/${appointmentId}`, {
        method: "PUT",
        body: JSON.stringify(payload),
    });

    return body.appointment || null;
};

export const cancelDoctorAppointment = async (appointmentId) => {
    const body = await doctorRequest(`/api/appointments/doctor/${appointmentId}/cancel`, {
        method: "POST",
    });

    return body.appointment || null;
};

export const updateDoctorProfile = async (doctorId, payload) => {
    const body = await doctorRequest(`/api/doctors/${doctorId}`, {
        method: "PUT",
        body: payload,
    });

    return normalizeDoctorProfile(
        body.data || body.doctor || body.profile || {}
    );
};

export { API_BASE, DoctorApiError };
