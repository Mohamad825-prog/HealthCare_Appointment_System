import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
    AlertCircle,
    CalendarDays,
    CheckCircle2,
    Clock3,
    CreditCard,
    LoaderCircle,
    LogOut,
    PencilLine,
    Phone,
    RefreshCw,
    Search,
    Shield,
    Star,
    Stethoscope,
    UserRound,
    Users,
    XCircle,
} from "lucide-react";

import {
    DoctorApiError,
    cancelDoctorAppointment,
    fetchDoctorAppointments,
    updateDoctorAppointment,
} from "../services/doctorApi";
import {
    clearDoctorSession,
    getDoctorProfile,
    getDoctorToken,
    setDoctorStoredProfile,
} from "../utils/doctorAuth";
import DoctorProfileEditor from "../components/DoctorProfileEditor";

const formatDate = (value) => {
    if (!value) return "N/A";

    try {
        return new Date(`${value}T00:00:00`).toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
            year: "numeric",
        });
    } catch {
        return value;
    }
};

const formatCurrency = (value) => `$${Number(value || 0).toFixed(0)}`;

const getPaymentSummary = (payment, fees) => {
    if (!payment) return `Unspecified - ${formatCurrency(fees)}`;

    const method = payment.method || "Payment";
    const status = payment.status || "Pending";
    const amount = payment.amount ?? fees ?? 0;

    return `${method} - ${status} - ${formatCurrency(amount)}`;
};

const getStatusBadgeClasses = (status) => {
    const normalized = String(status || "").toLowerCase();

    if (normalized === "confirmed") {
        return "bg-emerald-100 text-emerald-700 border-emerald-200";
    }
    if (normalized === "completed") {
        return "bg-slate-100 text-slate-700 border-slate-200";
    }
    if (normalized === "canceled" || normalized === "cancelled") {
        return "bg-rose-100 text-rose-700 border-rose-200";
    }
    if (normalized === "rescheduled") {
        return "bg-blue-100 text-blue-700 border-blue-200";
    }

    return "bg-amber-100 text-amber-700 border-amber-200";
};

const DoctorDashboard = () => {
    const navigate = useNavigate();

    const [doctorProfile, setDoctorProfile] = useState(() => getDoctorProfile());
    const [appointments, setAppointments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [refreshing, setRefreshing] = useState(false);
    const [actionId, setActionId] = useState("");
    const [isProfileEditorOpen, setIsProfileEditorOpen] = useState(false);

    useEffect(() => {
        const profile = getDoctorProfile();
        const token = getDoctorToken();

        if (!token || !profile?.id) {
            clearDoctorSession();
            navigate("/doctor-admin/login", { replace: true });
            return;
        }

        setDoctorProfile(profile);
        loadAppointments({ isRefresh: false });
    }, [navigate]);

    const handleUnauthorized = () => {
        clearDoctorSession();
        navigate("/doctor-admin/login", { replace: true });
    };

    const loadAppointments = async ({ isRefresh } = { isRefresh: false }) => {
        if (isRefresh) {
            setRefreshing(true);
        } else {
            setLoading(true);
        }

        setError("");

        try {
            const response = await fetchDoctorAppointments();
            setAppointments(response.appointments || []);
        } catch (err) {
            if (err instanceof DoctorApiError && err.status === 401) {
                handleUnauthorized();
                return;
            }
            setError(err.message || "Unable to load doctor appointments.");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const handleLogout = () => {
        clearDoctorSession();
        navigate("/doctor-admin/login", { replace: true });
    };

    const handleProfileUpdated = (updatedProfile) => {
        const nextProfile = setDoctorStoredProfile(updatedProfile);
        setDoctorProfile(nextProfile);
    };

    const applyAppointmentUpdate = (appointmentId, nextAppointment) => {
        setAppointments((prev) =>
            prev.map((item) =>
                String(item.id || item._id) === String(appointmentId)
                    ? { ...item, ...nextAppointment }
                    : item
            )
        );
    };

    const handleStatusAction = async (appointmentId, status) => {
        setActionId(`${appointmentId}:${status}`);
        setError("");

        try {
            const updated = await updateDoctorAppointment(appointmentId, { status });
            if (updated) {
                applyAppointmentUpdate(appointmentId, updated);
            }
        } catch (err) {
            if (err instanceof DoctorApiError && err.status === 401) {
                handleUnauthorized();
                return;
            }
            setError(err.message || "Unable to update appointment status.");
        } finally {
            setActionId("");
        }
    };

    const handleCancelAppointment = async (appointmentId) => {
        setActionId(`${appointmentId}:cancel`);
        setError("");

        try {
            const updated = await cancelDoctorAppointment(appointmentId);
            if (updated) {
                applyAppointmentUpdate(appointmentId, updated);
            }
        } catch (err) {
            if (err instanceof DoctorApiError && err.status === 401) {
                handleUnauthorized();
                return;
            }
            setError(err.message || "Unable to cancel appointment.");
        } finally {
            setActionId("");
        }
    };

    const filteredAppointments = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();

        return appointments.filter((appointment) => {
            const normalizedStatus = String(appointment.status || "").toLowerCase();

            if (statusFilter !== "all" && normalizedStatus !== statusFilter) {
                return false;
            }

            if (!query) return true;

            const haystack = [
                appointment.patientName,
                appointment.mobile,
                appointment.gender,
                appointment.date,
                appointment.time,
                appointment.notes,
                appointment.status,
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            return haystack.includes(query);
        });
    }, [appointments, searchQuery, statusFilter]);

    const stats = useMemo(() => {
        const pending = appointments.filter(
            (item) => String(item.status || "").toLowerCase() === "pending"
        ).length;
        const confirmed = appointments.filter(
            (item) => String(item.status || "").toLowerCase() === "confirmed"
        ).length;
        const completed = appointments.filter(
            (item) => String(item.status || "").toLowerCase() === "completed"
        ).length;
        const earnings = appointments
            .filter((item) => {
                const normalized = String(item.status || "").toLowerCase();
                return normalized === "confirmed" || normalized === "completed";
            })
            .reduce((sum, item) => sum + Number(item.fees || 0), 0);

        return {
            total: appointments.length,
            pending,
            confirmed,
            completed,
            earnings,
        };
    }, [appointments]);

    if (!doctorProfile) {
        return null;
    }

    return (
        <div className="min-h-screen bg-linear-to-br from-slate-50 via-emerald-50 to-white font-serif">
            <div className="border-b border-emerald-100 bg-white/85 backdrop-blur-md sticky top-0 z-40">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <p className="text-xs sm:text-sm font-semibold uppercase tracking-[0.25em] text-emerald-600">
                            Doctor Dashboard
                        </p>
                        <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-slate-900">
                            Welcome, {doctorProfile.name || "Doctor"}
                        </h1>
                        <p className="mt-1 text-sm text-slate-500">
                            Internal portal for your appointments, availability context,
                            and patient visit workflow.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        <Link
                            to="/"
                            className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
                        >
                            Patient Site
                        </Link>
                        <button
                            type="button"
                            onClick={() =>
                                setIsProfileEditorOpen((current) => !current)
                            }
                            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
                                isProfileEditorOpen
                                    ? "bg-emerald-600 text-white hover:bg-emerald-700"
                                    : "border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50"
                            }`}
                        >
                            <PencilLine className="w-4 h-4" />
                            {isProfileEditorOpen ? "Close Profile" : "Edit Profile"}
                        </button>
                        <button
                            onClick={() => loadAppointments({ isRefresh: true })}
                            disabled={refreshing}
                            className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
                        >
                            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
                            Refresh
                        </button>
                        <button
                            onClick={handleLogout}
                            className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                        >
                            <LogOut className="w-4 h-4" />
                            Logout
                        </button>
                    </div>
                </div>
            </div>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <section
                    className={`grid grid-cols-1 gap-6 ${
                        isProfileEditorOpen
                            ? ""
                            : "xl:grid-cols-[1.15fr_1.85fr]"
                    }`}
                >
                    <section className="space-y-6">
                        <article className="overflow-hidden rounded-[2rem] border border-emerald-100 bg-white shadow-lg">
                            <div className="relative bg-linear-to-r from-emerald-600 to-teal-500 px-6 py-8 text-white">
                                <div className="absolute -top-10 -right-8 h-28 w-28 rounded-full bg-white/10" />
                                <div className="absolute -bottom-12 -left-8 h-32 w-32 rounded-full bg-white/10" />
                                <div className="relative flex flex-col sm:flex-row sm:items-center gap-5">
                                    <div className="h-24 w-24 rounded-3xl overflow-hidden border-4 border-white/70 bg-white/30 shadow-lg">
                                        {doctorProfile.imageUrl ? (
                                            <img
                                                src={doctorProfile.imageUrl}
                                                alt={doctorProfile.name || "Doctor"}
                                                className="h-full w-full object-cover"
                                            />
                                        ) : (
                                            <div className="h-full w-full flex items-center justify-center bg-white/10">
                                                <UserRound className="w-10 h-10 text-white" />
                                            </div>
                                        )}
                                    </div>

                                    <div className="min-w-0">
                                        <h2 className="text-2xl font-bold">
                                            {doctorProfile.name || "Doctor"}
                                        </h2>
                                        <p className="mt-1 text-emerald-50 font-semibold">
                                            {doctorProfile.specialization || "General Practice"}
                                        </p>
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            <span className="rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-semibold">
                                                {doctorProfile.availability || "Available"}
                                            </span>
                                            <span className="rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-semibold">
                                                Fee {formatCurrency(doctorProfile.fee)}
                                            </span>
                                            <span className="rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-semibold">
                                                Rating {doctorProfile.rating || 0}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="p-6 space-y-4">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                                        <p className="text-xs uppercase tracking-[0.2em] text-emerald-600 font-semibold">
                                            Email
                                        </p>
                                        <p className="mt-2 text-sm text-slate-700 break-all">
                                            {doctorProfile.email || "N/A"}
                                        </p>
                                    </div>
                                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                                        <p className="text-xs uppercase tracking-[0.2em] text-emerald-600 font-semibold">
                                            Experience
                                        </p>
                                        <p className="mt-2 text-sm text-slate-700">
                                            {doctorProfile.experience || "Not provided"}
                                        </p>
                                    </div>
                                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                                        <p className="text-xs uppercase tracking-[0.2em] text-emerald-600 font-semibold">
                                            Qualifications
                                        </p>
                                        <p className="mt-2 text-sm text-slate-700">
                                            {doctorProfile.qualifications || "Not provided"}
                                        </p>
                                    </div>
                                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                                        <p className="text-xs uppercase tracking-[0.2em] text-emerald-600 font-semibold">
                                            Location
                                        </p>
                                        <p className="mt-2 text-sm text-slate-700">
                                            {doctorProfile.location || "Not provided"}
                                        </p>
                                    </div>
                                </div>

                                {(doctorProfile.patients || doctorProfile.success || doctorProfile.about) && (
                                    <div className="rounded-3xl border border-slate-100 bg-slate-50 p-5">
                                        <div className="flex flex-wrap gap-2">
                                            {doctorProfile.patients && (
                                                <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 border border-slate-200">
                                                    <Users className="w-3.5 h-3.5 text-emerald-600" />
                                                    {doctorProfile.patients}
                                                </span>
                                            )}
                                            {doctorProfile.success && (
                                                <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 border border-slate-200">
                                                    <Shield className="w-3.5 h-3.5 text-emerald-600" />
                                                    {doctorProfile.success}
                                                </span>
                                            )}
                                            {Number(doctorProfile.rating || 0) > 0 && (
                                                <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 border border-slate-200">
                                                    <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                                                    {doctorProfile.rating} rating
                                                </span>
                                            )}
                                        </div>

                                        {doctorProfile.about && (
                                            <p className="mt-4 text-sm leading-relaxed text-slate-600">
                                                {doctorProfile.about}
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>
                        </article>

                        {isProfileEditorOpen && (
                            <DoctorProfileEditor
                                doctorProfile={doctorProfile}
                                onProfileUpdated={handleProfileUpdated}
                                onUnauthorized={handleUnauthorized}
                            />
                        )}
                    </section>

                    {!isProfileEditorOpen && (
                        <section className="space-y-6">
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                            {[
                                {
                                    label: "Total Appointments",
                                    value: stats.total,
                                    icon: CalendarDays,
                                    tint: "from-emerald-100 to-emerald-50 border-emerald-100",
                                },
                                {
                                    label: "Pending",
                                    value: stats.pending,
                                    icon: Clock3,
                                    tint: "from-amber-100 to-amber-50 border-amber-100",
                                },
                                {
                                    label: "Confirmed",
                                    value: stats.confirmed,
                                    icon: CheckCircle2,
                                    tint: "from-teal-100 to-teal-50 border-teal-100",
                                },
                                {
                                    label: "Earnings",
                                    value: formatCurrency(stats.earnings),
                                    icon: CreditCard,
                                    tint: "from-slate-100 to-white border-slate-100",
                                },
                            ].map(({ label, value, icon: Icon, tint }) => (
                                <article
                                    key={label}
                                    className={`rounded-[1.75rem] border bg-linear-to-br ${tint} p-5 shadow-sm`}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="text-xs uppercase tracking-[0.2em] text-slate-500 font-semibold">
                                                {label}
                                            </p>
                                            <p className="mt-3 text-3xl font-bold text-slate-900">
                                                {value}
                                            </p>
                                        </div>
                                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-emerald-700 shadow-sm">
                                            <Icon className="w-5 h-5" />
                                        </div>
                                    </div>
                                </article>
                            ))}
                        </div>

                        <article className="rounded-[2rem] border border-emerald-100 bg-white shadow-lg">
                            <div className="border-b border-emerald-100 px-5 sm:px-6 py-5">
                                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                                    <div>
                                        <h3 className="text-xl font-bold text-slate-900">
                                            Doctor Appointments
                                        </h3>
                                        <p className="mt-1 text-sm text-slate-500">
                                            Review your assigned patients and update visit
                                            progress using the existing backend-supported
                                            actions.
                                        </p>
                                    </div>

                                    <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
                                        <label className="relative flex-1 lg:w-72">
                                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-600" />
                                            <input
                                                type="text"
                                                value={searchQuery}
                                                onChange={(event) => setSearchQuery(event.target.value)}
                                                placeholder="Search patient, phone, notes..."
                                                className="w-full rounded-full border border-emerald-200 bg-emerald-50/60 py-3 pl-11 pr-4 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-emerald-300"
                                            />
                                        </label>

                                        <select
                                            value={statusFilter}
                                            onChange={(event) => setStatusFilter(event.target.value)}
                                            className="rounded-full border border-emerald-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-emerald-300"
                                        >
                                            <option value="all">All Statuses</option>
                                            <option value="pending">Pending</option>
                                            <option value="confirmed">Confirmed</option>
                                            <option value="completed">Completed</option>
                                            <option value="canceled">Canceled</option>
                                            <option value="rescheduled">Rescheduled</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {error && (
                                <div className="mx-5 sm:mx-6 mt-5 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
                                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-rose-600" />
                                    <p className="text-sm text-rose-700">{error}</p>
                                </div>
                            )}

                            {loading ? (
                                <div className="px-5 sm:px-6 py-14">
                                    <div className="flex items-center justify-center gap-3 rounded-[1.5rem] border border-emerald-100 bg-emerald-50/70 px-6 py-10 text-emerald-700">
                                        <LoaderCircle className="w-5 h-5 animate-spin" />
                                        Loading doctor appointments...
                                    </div>
                                </div>
                            ) : filteredAppointments.length === 0 ? (
                                <div className="px-5 sm:px-6 py-14">
                                    <div className="rounded-[1.5rem] border border-emerald-100 bg-emerald-50/70 px-6 py-10 text-center">
                                        <Stethoscope className="w-10 h-10 mx-auto text-emerald-500" />
                                        <h4 className="mt-4 text-lg font-bold text-slate-900">
                                            No appointments found
                                        </h4>
                                        <p className="mt-2 text-sm text-slate-500">
                                            {appointments.length === 0
                                                ? "No patient appointments are currently assigned to this doctor."
                                                : "Try adjusting the search or status filter."}
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div className="p-5 sm:p-6 space-y-4">
                                    {filteredAppointments.map((appointment) => {
                                        const appointmentId = appointment.id || appointment._id;
                                        const normalizedStatus = String(
                                            appointment.status || ""
                                        ).toLowerCase();
                                        const isTerminal =
                                            normalizedStatus === "completed" ||
                                            normalizedStatus === "canceled";
                                        const isConfirming =
                                            actionId === `${appointmentId}:Confirmed`;
                                        const isCompleting =
                                            actionId === `${appointmentId}:Completed`;
                                        const isCancelling =
                                            actionId === `${appointmentId}:cancel`;

                                        return (
                                            <article
                                                key={appointmentId}
                                                className="rounded-[1.75rem] border border-slate-100 bg-slate-50/70 p-5 shadow-sm"
                                            >
                                                <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-5">
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex flex-wrap items-center gap-3">
                                                            <h4 className="text-lg font-bold text-slate-900">
                                                                {appointment.patientName || "Patient"}
                                                            </h4>
                                                            <span
                                                                className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${getStatusBadgeClasses(
                                                                    appointment.status
                                                                )}`}
                                                            >
                                                                {appointment.status || "Pending"}
                                                            </span>
                                                        </div>

                                                        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 text-sm text-slate-600">
                                                            <div className="rounded-2xl border border-white bg-white px-4 py-3">
                                                                <p className="text-xs uppercase tracking-[0.18em] text-slate-400 font-semibold">
                                                                    Schedule
                                                                </p>
                                                                <p className="mt-2 font-semibold text-slate-800">
                                                                    {formatDate(appointment.date)}
                                                                </p>
                                                                <p className="mt-1 text-slate-500">
                                                                    {appointment.time || "N/A"}
                                                                </p>
                                                            </div>

                                                            <div className="rounded-2xl border border-white bg-white px-4 py-3">
                                                                <p className="text-xs uppercase tracking-[0.18em] text-slate-400 font-semibold">
                                                                    Patient Info
                                                                </p>
                                                                <p className="mt-2 flex items-center gap-2 text-slate-700">
                                                                    <UserRound className="w-4 h-4 text-emerald-600" />
                                                                    {appointment.age || "N/A"} yrs
                                                                    {appointment.gender ? ` - ${appointment.gender}` : ""}
                                                                </p>
                                                                <p className="mt-1 flex items-center gap-2 text-slate-700">
                                                                    <Phone className="w-4 h-4 text-emerald-600" />
                                                                    {appointment.mobile || "N/A"}
                                                                </p>
                                                            </div>

                                                            <div className="rounded-2xl border border-white bg-white px-4 py-3">
                                                                <p className="text-xs uppercase tracking-[0.18em] text-slate-400 font-semibold">
                                                                    Payment
                                                                </p>
                                                                <p className="mt-2 flex items-center gap-2 font-semibold text-slate-800">
                                                                    <CreditCard className="w-4 h-4 text-emerald-600" />
                                                                    {formatCurrency(appointment.fees)}
                                                                </p>
                                                                <p className="mt-1 text-slate-500 text-xs sm:text-sm">
                                                                    {getPaymentSummary(
                                                                        appointment.payment,
                                                                        appointment.fees
                                                                    )}
                                                                </p>
                                                            </div>

                                                            <div className="rounded-2xl border border-white bg-white px-4 py-3">
                                                                <p className="text-xs uppercase tracking-[0.18em] text-slate-400 font-semibold">
                                                                    Notes
                                                                </p>
                                                                <p className="mt-2 line-clamp-3 text-slate-600">
                                                                    {appointment.notes || "No notes provided."}
                                                                </p>
                                                            </div>
                                                        </div>

                                                        {appointment.rescheduledTo && (
                                                            <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                                                                Rescheduled to {formatDate(appointment.rescheduledTo.date)}
                                                                {appointment.rescheduledTo.time
                                                                    ? ` at ${appointment.rescheduledTo.time}`
                                                                    : ""}
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="xl:w-56 flex xl:flex-col gap-3 flex-wrap">
                                                        {normalizedStatus !== "confirmed" &&
                                                            !isTerminal && (
                                                                <button
                                                                    onClick={() =>
                                                                        handleStatusAction(
                                                                            appointmentId,
                                                                            "Confirmed"
                                                                        )
                                                                    }
                                                                    disabled={Boolean(actionId)}
                                                                    className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                                                                >
                                                                    {isConfirming ? (
                                                                        <LoaderCircle className="w-4 h-4 animate-spin" />
                                                                    ) : (
                                                                        <CheckCircle2 className="w-4 h-4" />
                                                                    )}
                                                                    Confirm
                                                                </button>
                                                            )}

                                                        {normalizedStatus !== "completed" &&
                                                            normalizedStatus !== "canceled" && (
                                                                <button
                                                                    onClick={() =>
                                                                        handleStatusAction(
                                                                            appointmentId,
                                                                            "Completed"
                                                                        )
                                                                    }
                                                                    disabled={Boolean(actionId)}
                                                                    className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                                                                >
                                                                    {isCompleting ? (
                                                                        <LoaderCircle className="w-4 h-4 animate-spin" />
                                                                    ) : (
                                                                        <CalendarDays className="w-4 h-4" />
                                                                    )}
                                                                    Mark Completed
                                                                </button>
                                                            )}

                                                        {normalizedStatus !== "completed" &&
                                                            normalizedStatus !== "canceled" && (
                                                                <button
                                                                    onClick={() =>
                                                                        handleCancelAppointment(appointmentId)
                                                                    }
                                                                    disabled={Boolean(actionId)}
                                                                    className="inline-flex items-center justify-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                                                                >
                                                                    {isCancelling ? (
                                                                        <LoaderCircle className="w-4 h-4 animate-spin" />
                                                                    ) : (
                                                                        <XCircle className="w-4 h-4" />
                                                                    )}
                                                                    Cancel
                                                                </button>
                                                            )}

                                                        {isTerminal && (
                                                            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
                                                                This appointment is already {appointment.status}.
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </article>
                                        );
                                    })}
                                </div>
                            )}
                        </article>
                        </section>
                    )}
                </section>
            </main>
        </div>
    );
};

export default DoctorDashboard;
