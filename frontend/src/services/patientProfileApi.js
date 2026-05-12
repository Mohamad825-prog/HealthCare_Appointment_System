const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:4000";

class PatientProfileApiError extends Error {
    constructor(message, status, data) {
        super(message);
        this.name = "PatientProfileApiError";
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

const patientProfileRequest = async (getToken, path, options = {}) => {
    const token = typeof getToken === "function" ? await getToken() : "";
    const headers = {
        "Content-Type": "application/json",
        ...(options.headers || {}),
    };

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers,
    });

    const body = await parseJsonSafely(response);

    if (!response.ok || body.success === false) {
        throw new PatientProfileApiError(
            body?.message || `Request failed (${response.status})`,
            response.status,
            body
        );
    }

    return body;
};

export const getPatientProfile = async (getToken) => {
    const body = await patientProfileRequest(getToken, "/api/patient/profile");
    return body.data || null;
};

export const updatePatientProfile = async (getToken, profileData) => {
    const body = await patientProfileRequest(getToken, "/api/patient/profile", {
        method: "PUT",
        body: JSON.stringify(profileData),
    });

    return body.data || null;
};

export { API_BASE, PatientProfileApiError };
