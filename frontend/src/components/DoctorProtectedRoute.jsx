import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { getDoctorProfile, isDoctorAuthenticated } from "../utils/doctorAuth";

const DoctorProtectedRoute = ({ children }) => {
    const location = useLocation();
    const doctorProfile = getDoctorProfile();

    if (!isDoctorAuthenticated() || !doctorProfile?.id) {
        return (
            <Navigate
                to="/doctor-admin/login"
                replace
                state={{ from: location.pathname }}
            />
        );
    }

    return children;
};

export default DoctorProtectedRoute;

