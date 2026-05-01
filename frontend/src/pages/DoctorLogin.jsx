import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
    AlertCircle,
    ArrowRight,
    KeyRound,
    Mail,
    ShieldCheck,
    Stethoscope,
} from "lucide-react";

import Navbar from "../components/Navbar";
import { loginDoctor } from "../services/doctorApi";
import {
    getDoctorProfile,
    isDoctorAuthenticated,
    setDoctorSession,
} from "../utils/doctorAuth";

const DoctorLogin = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const redirectPath = location.state?.from || "/doctor-admin/dashboard";

    const [form, setForm] = useState({
        email: "",
        password: "",
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        if (isDoctorAuthenticated() && getDoctorProfile()?.id) {
            navigate("/doctor-admin/dashboard", { replace: true });
        }
    }, [navigate]);

    const handleChange = (event) => {
        const { name, value } = event.target;
        setForm((prev) => ({ ...prev, [name]: value }));
        setError("");
    };

    const handleSubmit = async (event) => {
        event.preventDefault();

        if (!form.email.trim() || !form.password) {
            setError("Doctor email and password are required.");
            return;
        }

        setLoading(true);
        setError("");

        try {
            const result = await loginDoctor({
                email: form.email.trim(),
                password: form.password,
            });

            if (!result.token || !result.doctor?.id) {
                throw new Error("Invalid doctor login response.");
            }

            setDoctorSession({
                token: result.token,
                doctor: result.doctor,
            });

            navigate(redirectPath, { replace: true });
        } catch (err) {
            setError(err.message || "Unable to sign in. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-linear-to-br from-emerald-50 via-white to-teal-50 font-serif">
            <Navbar />

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-16">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
                    <section className="relative overflow-hidden rounded-[2rem] border border-emerald-100 bg-linear-to-br from-emerald-600 via-emerald-500 to-teal-500 text-white shadow-2xl p-8 sm:p-10">
                        <div className="absolute -top-16 -right-10 w-48 h-48 rounded-full bg-white/10 blur-2xl" />
                        <div className="absolute -bottom-16 -left-12 w-56 h-56 rounded-full bg-white/10 blur-2xl" />

                        <div className="relative">
                            <div className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-4 py-2 text-sm font-semibold">
                                <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
                                Separate Doctor Access
                            </div>

                            <h1 className="mt-6 text-4xl sm:text-5xl font-bold leading-tight">
                                Doctor Portal
                            </h1>
                            <p className="mt-4 max-w-xl text-emerald-50/90 text-base sm:text-lg leading-relaxed">
                                Sign in with your doctor email and password to review your
                                profile, monitor upcoming consultations, and manage
                                appointment status from one secure workspace.
                            </p>

                            <div className="mt-8 space-y-3">
                                {[
                                    "Doctor login stays separate from the patient Clerk session.",
                                    "Appointments shown here are scoped to the signed-in doctor.",
                                    "Only doctor-safe profile data is stored in local storage.",
                                ].map((item) => (
                                    <div
                                        key={item}
                                        className="flex items-start gap-3 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 backdrop-blur-sm"
                                    >
                                        <ShieldCheck className="w-5 h-5 mt-0.5 flex-shrink-0 text-emerald-100" />
                                        <p className="text-sm sm:text-base text-white/95">{item}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </section>

                    <section className="rounded-[2rem] border border-emerald-100 bg-white/90 shadow-xl backdrop-blur-sm p-6 sm:p-8 lg:p-10">
                        <div className="flex items-center gap-3">
                            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                                <Stethoscope className="w-7 h-7" />
                            </div>
                            <div>
                                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600">
                                    Doctor Admin
                                </p>
                                <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">
                                    Sign In
                                </h2>
                            </div>
                        </div>

                        <p className="mt-5 text-sm sm:text-base text-slate-500 leading-relaxed">
                            This portal is for doctors only. Patient browsing and patient
                            authentication remain available separately on the main site.
                        </p>

                        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
                            <label className="block">
                                <span className="mb-2 block text-sm font-semibold text-slate-700">
                                    Doctor Email
                                </span>
                                <div className="flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 focus-within:ring-2 focus-within:ring-emerald-300">
                                    <Mail className="w-4 h-4 text-emerald-600" />
                                    <input
                                        type="email"
                                        name="email"
                                        value={form.email}
                                        onChange={handleChange}
                                        autoComplete="email"
                                        placeholder="doctor@example.com"
                                        className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
                                    />
                                </div>
                            </label>

                            <label className="block">
                                <span className="mb-2 block text-sm font-semibold text-slate-700">
                                    Password
                                </span>
                                <div className="flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 focus-within:ring-2 focus-within:ring-emerald-300">
                                    <KeyRound className="w-4 h-4 text-emerald-600" />
                                    <input
                                        type="password"
                                        name="password"
                                        value={form.password}
                                        onChange={handleChange}
                                        autoComplete="current-password"
                                        placeholder="Enter your password"
                                        className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
                                    />
                                </div>
                            </label>

                            {error && (
                                <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
                                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-rose-600" />
                                    <p className="text-sm text-rose-700">{error}</p>
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={loading}
                                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-linear-to-r from-emerald-600 to-teal-500 px-5 py-3.5 text-sm font-semibold text-white shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                            >
                                {loading ? (
                                    <>
                                        <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                                        Signing In...
                                    </>
                                ) : (
                                    <>
                                        Access Dashboard
                                        <ArrowRight className="w-4 h-4" />
                                    </>
                                )}
                            </button>
                        </form>

                        <div className="mt-8 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                            <p className="font-semibold text-slate-800">Need the patient site instead?</p>
                            <div className="mt-2 flex flex-wrap gap-3">
                                <Link
                                    to="/"
                                    className="inline-flex items-center gap-2 text-emerald-700 hover:text-emerald-800"
                                >
                                    Back to Home
                                </Link>
                                <Link
                                    to="/appointments"
                                    className="inline-flex items-center gap-2 text-emerald-700 hover:text-emerald-800"
                                >
                                    Patient Appointments
                                </Link>
                            </div>
                        </div>
                    </section>
                </div>
            </main>
        </div>
    );
};

export default DoctorLogin;

