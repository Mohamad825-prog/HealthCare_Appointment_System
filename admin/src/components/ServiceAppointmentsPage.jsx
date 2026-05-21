import React, { useEffect, useMemo, useState } from 'react'
import { useAuth, useUser } from '@clerk/clerk-react';
import { serviceAppointmentsStyles } from '../assets/dummyStyles';
import { Loader2, SearchIcon, XIcon, DollarSign, User, Phone, Calendar, Clock, CheckCircle, XCircle, CreditCard, FileText, Upload, ExternalLink } from 'lucide-react';

const API_BASE = "http://localhost:4000";
// Helpers function

function formatTwo(n) {
    return String(n).padStart(2, "0");
}

function formatDateNice(dateStr) {
    if (!dateStr) return "To be scheduled";
    const d = new Date(`${dateStr}T00:00:00`);
    return d.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
    });
}

function parseTimeToParts(timeStr) {
    if (!timeStr) return { hour: null, minute: null, ampm: "" };
    const m = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
    if (m) {
        let hh = Number(m[1]);
        const mm = Number(m[2]);
        const ampm = m[3] ? m[3].toUpperCase() : null;
        if (!ampm) {
            const hour12 = hh % 12 === 0 ? 12 : hh % 12;
            return { hour: hour12, minute: mm, ampm: hh >= 12 ? "PM" : "AM" };
        }
        return { hour: hh, minute: mm, ampm };
    }
    return { hour: null, minute: null, ampm: "" };
}// For time am/pm

function timePartsTo12HourString(hh24, mm) {
    let ampm = hh24 >= 12 ? "PM" : "AM";
    let hour = hh24 % 12 === 0 ? 12 : hh24 % 12;
    return `${formatTwo(hour)}:${formatTwo(mm)} ${ampm}`;
}

function timePartsToInputValue(a) {
    if (a.hour === null || a.hour === undefined || a.minute === null || a.minute === undefined || !a.ampm) {
        return "";
    }
    const hour = Number(a.hour || 0);
    const minute = Number(a.minute || 0);
    let hh24 = hour % 12;
    if ((a.ampm || "AM").toUpperCase() === "PM") hh24 += 12;
    if (a.ampm === "AM" && hour === 12) hh24 = 0;
    if (a.ampm === "PM" && hour === 12) hh24 = 12;
    return `${formatTwo(hh24)}:${formatTwo(minute)}`;
}

// How to display
function formatTimeDisplay(a) {
    if (a.hour === null || a.hour === undefined || a.minute === null || a.minute === undefined || !a.ampm) {
        return "To be scheduled";
    }
    return `${formatTwo(a.hour)}:${formatTwo(a.minute)} ${a.ampm}`;
}

function mapServiceAppointment(a) {
    const hasStoredTime =
        a.hour !== undefined &&
        a.hour !== null &&
        a.minute !== undefined &&
        a.minute !== null &&
        a.ampm;
    const timeStr =
        a.time ||
        (a.slot && a.slot.time) ||
        (hasStoredTime
            ? `${formatTwo(a.hour)}:${formatTwo(a.minute)} ${a.ampm}`
            : a.rescheduledTo?.time || "");
    const parsed = parseTimeToParts(timeStr);
    const payment = a.payment || {};

    return {
        id: a._id || a.id,
        patientName:
            a.patientName ||
            a.name ||
            (a.raw && a.raw.patientName) ||
            "Unknown",
        gender: a.gender || (a.raw && a.raw.gender) || "",
        mobile: a.mobile || a.phone || "",
        age: a.age || a.raw?.age || "",
        serviceName:
            a.serviceName ||
            a.service ||
            a.raw?.serviceName ||
            (a.notes || "").slice(0, 40),
        fees: a.fees ?? a.fee ?? payment.amount ?? 0,
        date: a.date || (a.slot && a.slot.date) || a.rescheduledTo?.date || "",
        hour: parsed.hour,
        minute: parsed.minute,
        ampm: parsed.ampm,
        status: a.status || "Pending",
        payment,
        paymentMethod: payment.method || "Online",
        paymentStatus: payment.status || "Pending",
        paidAt: a.paidAt || payment.paidAt || null,
        hasResult: Boolean(a.hasResult),
        resultStatus: a.resultStatus || a.result_status || "",
        raw: a,
    };
}

function paymentBadgeClasses(status) {
    const normalized = String(status || "").toLowerCase();

    if (normalized === "paid") return "bg-emerald-50 text-emerald-700 border-emerald-100";
    if (normalized === "failed") return "bg-rose-50 text-rose-700 border-rose-100";
    if (normalized === "refunded") return "bg-slate-50 text-slate-700 border-slate-100";
    return "bg-amber-50 text-amber-700 border-amber-100";
}

const EMPTY_RESULT_FORM = {
    resultTitle: "",
    resultSummary: "",
    resultValuesJson: "{}",
    resultFileUrl: "",
    resultStatus: "Draft",
    resultFile: null,
};

function resultBadgeClasses(status) {
    const normalized = String(status || "").toLowerCase();

    if (normalized === "available") return "bg-emerald-50 text-emerald-700 border-emerald-100";
    if (normalized === "draft") return "bg-amber-50 text-amber-700 border-amber-100";
    if (normalized === "hidden") return "bg-slate-50 text-slate-700 border-slate-100";
    return "bg-gray-50 text-gray-600 border-gray-100";
}

function normalizeResultFromApi(result) {
    if (!result) return null;

    return {
        id: result.id || result._id || "",
        serviceAppointmentId: result.serviceAppointmentId || result.service_appointment_id || "",
        resultTitle: result.resultTitle || result.result_title || "",
        resultSummary: result.resultSummary || result.result_summary || "",
        resultValues: result.resultValues ?? result.result_values ?? null,
        resultFileUrl: result.resultFileUrl || result.result_file_url || "",
        resultFilePublicId: result.resultFilePublicId || result.result_file_public_id || "",
        resultStatus: result.resultStatus || result.result_status || "Draft",
        createdAt: result.createdAt || result.created_at || "",
        updatedAt: result.updatedAt || result.updated_at || "",
    };
}

function resultValuesToJson(values) {
    if (!values) return "{}";

    try {
        return JSON.stringify(values, null, 2);
    } catch {
        return "{}";
    }
}

// Status badge component
function StatusBadge({ status }) {
    const classes = serviceAppointmentsStyles.statusBadge(status);
    return (
        <span className={classes}>
            {status === "Confirmed" && <CheckCircle className="h-4 w-4" />}
            {status === "Canceled" && <XCircle className="h-4 w-4" />}
            {status}
        </span>
    );
}

// Toast component for notifications
function Toast({ toasts, removeToast }) {
    return (
        <div className={serviceAppointmentsStyles.toastContainer}>
            {toasts.map((t) => (
                <div
                    key={t.id}
                    className={serviceAppointmentsStyles.toast}
                >
                    <div className={serviceAppointmentsStyles.toastContent}>
                        <div className="mt-0.5">
                            <Loader2 className={serviceAppointmentsStyles.toastSpinner} />
                        </div>
                        <div className={serviceAppointmentsStyles.toastText}>
                            <div className={serviceAppointmentsStyles.toastTitle}>{t.title}</div>
                            <div className={serviceAppointmentsStyles.toastMessage}>{t.message}</div>
                        </div>
                        <button
                            onClick={() => removeToast(t.id)}
                            className={serviceAppointmentsStyles.toastCloseButton}
                            aria-label="close toast"
                        >
                            ✕
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
}

// For status select small component
function StatusSelect({ appointment, onChange, disabled }) {
    const terminal =
        appointment.status === "Completed" || appointment.status === "Canceled";

    const options = [
        { value: "Pending", label: "Pending" },
        { value: "Confirmed", label: "Confirmed" },
        { value: "Completed", label: "Completed" },
        { value: "Canceled", label: "Canceled" },
    ];

    return (
        <select
            value={appointment.status}
            onChange={(e) => onChange(e.target.value)}
            disabled={terminal || disabled}
            className={serviceAppointmentsStyles.statusSelect(terminal)}
            title={terminal ? "Status cannot be changed" : "Change status"}
        >
            {options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                    {opt.label}
                </option>
            ))}
        </select>
    );
}

// To get todays date ex-YYYY-MM-DD
function getTodayISO() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}
//To check previous date comes first that is upcoming date comes first
function isDateBefore(aDateStr, bDateStr) {
    try {
        const a = new Date(`${aDateStr}T00:00:00`);
        const b = new Date(`${bDateStr}T00:00:00`);
        return a.getTime() < b.getTime();
    } catch {
        return false;
    }
}

// For reschedule button and its logic
function RescheduleButton({ appointment, onReschedule, disabled }) {
    const terminal =
        appointment.status === "Completed" || appointment.status === "Canceled";
    const [editing, setEditing] = useState(false);
    const todayISO = getTodayISO();
    const [date, setDate] = useState(appointment.date || todayISO);
    const [time, setTime] = useState(timePartsToInputValue(appointment));

    useEffect(() => {
        const baseDate = appointment.date || "";
        const initialDate =
            baseDate && !isDateBefore(baseDate, todayISO) ? baseDate : todayISO;
        setDate(initialDate);
        setTime(timePartsToInputValue(appointment));
    }, [
        appointment.date,
        appointment.hour,
        appointment.minute,
        appointment.ampm,
    ]);

    // To save after editing
    function save() {
        if (!date || !time) return;
        if (isDateBefore(date, getTodayISO())) {
            alert("Please choose today or a future date for rescheduling.");
            return;
        }
        onReschedule(date, time);
        setEditing(false);
    }
    // To cancel a booking
    function cancel() {
        const baseDate = appointment.date || "";
        const restoreDate =
            baseDate && !isDateBefore(baseDate, getTodayISO())
                ? baseDate
                : getTodayISO();
        setDate(restoreDate);
        setTime(timePartsToInputValue(appointment));
        setEditing(false);
    }

    return (
        <div className="w-full">
            {!editing ? (
                <div className="flex justify-end">
                    <button
                        onClick={() => setEditing(true)}
                        disabled={terminal || disabled}
                        title={
                            terminal ? "Cannot reschedule completed/canceled" : "Reschedule"
                        }
                        className={serviceAppointmentsStyles.rescheduleButton(terminal)}
                    >
                        Reschedule
                    </button>
                </div>
            ) : (
                <div className={serviceAppointmentsStyles.rescheduleEditContainer}>
                    <input
                        type="date"
                        value={date}
                        min={getTodayISO()}
                        onChange={(e) => setDate(e.target.value)}
                        className={serviceAppointmentsStyles.rescheduleDateInput}
                    />
                    <input
                        type="time"
                        value={time}
                        onChange={(e) => setTime(e.target.value)}
                        className={serviceAppointmentsStyles.rescheduleTimeInput}
                    />
                    <div className={serviceAppointmentsStyles.rescheduleActions}>
                        <button
                            onClick={save}
                            className={serviceAppointmentsStyles.rescheduleSaveButton}
                        >
                            Save
                        </button>
                        <button
                            onClick={cancel}
                            className={serviceAppointmentsStyles.rescheduleCancelButton}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

const ServiceAppointmentsPage = () => {

    const { getToken } = useAuth();
    const { user } = useUser();
    const [appointments, setAppointments] = useState([]);
    const [toasts, setToasts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [markingPaymentId, setMarkingPaymentId] = useState("");
    const [resultByAppointmentId, setResultByAppointmentId] = useState({});
    const [resultEditor, setResultEditor] = useState({
        open: false,
        appointment: null,
        loading: false,
        saving: false,
        error: "",
        form: { ...EMPTY_RESULT_FORM },
    });

    // Search & debounce
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(search.trim()), 220);
        return () => clearTimeout(t);
    }, [search]);

    const [statusFilter, setStatusFilter] = useState("");

    useEffect(() => {
        fetchAppointments();
    }, []);

    function pushToast(title, message) {
        const toastId = Date.now() + Math.random();
        setToasts((t) => [...t, { id: toastId, title, message }]);
    }
    function removeToast(id) {
        setToasts((t) => t.filter((x) => x.id !== id));
    }

    async function fetchAppointments() {
        setLoading(true);
        setError(null);
        try {
            const url = `${API_BASE}/api/service-appointments?limit=500`;
            const res = await fetch(url);
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(
                    body?.message || `Failed to fetch appointments (${res.status})`
                );
            }
            const body = await res.json();
            const list = Array.isArray(body.appointments)
                ? body.appointments
                : body.appointments ??
                body.items ??
                body.data ??
                body.appointments ??
                [];

            const normalized = (Array.isArray(list) ? list : [])
                .map(mapServiceAppointment)
                .filter(Boolean);
            setAppointments(normalized);
            fetchResultsForAppointments(normalized);
        } catch (err) {
            console.error("fetchAppointments:", err);
            setError(err.message || "Failed to load appointments");
            setAppointments([]);
            setResultByAppointmentId({});
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        if (toasts.length === 0) return;
        const timers = toasts.map((t) =>
            setTimeout(() => {
                setToasts((s) => s.filter((x) => x.id !== t.id));
            }, 3000)
        );
        return () => timers.forEach((t) => clearTimeout(t));
    }, [toasts]);

    function extractUpdated(body) {
        return body?.data || body?.appointment || body || {};
    }

    async function getAdminHeaders({ json = true } = {}) {
        const headers = json ? { "Content-Type": "application/json" } : {};

        try {
            const token = await getToken?.();
            if (token) headers.Authorization = `Bearer ${token}`;
        } catch (tokenError) {
            console.warn("Unable to read admin Clerk token", tokenError);
        }

        if (user?.id) {
            headers["X-Admin-Id"] = user.id;
        }

        return headers;
    }

    async function fetchResultsForAppointments(list) {
        if (!Array.isArray(list) || list.length === 0) {
            setResultByAppointmentId({});
            return;
        }

        try {
            const headers = await getAdminHeaders();
            const entries = await Promise.all(
                list.map(async (appointment) => {
                    try {
                        const res = await fetch(`${API_BASE}/api/admin/service-appointments/${appointment.id}/result`, {
                            headers,
                        });
                        const body = await res.json().catch(() => ({}));
                        if (!res.ok || body?.success === false) return [appointment.id, null];
                        return [appointment.id, normalizeResultFromApi(body.result || body.data)];
                    } catch {
                        return [appointment.id, null];
                    }
                })
            );

            setResultByAppointmentId(Object.fromEntries(entries));
        } catch {
            setResultByAppointmentId({});
        }
    }

    async function markCashServicePaymentPaid(id) {
        const appt = appointments.find((x) => x.id === id);
        if (!appt) return;

        const ok = window.confirm(
            `Mark cash payment as PAID for ${appt.patientName} - ${appt.serviceName} on ${formatDateNice(appt.date)} at ${formatTimeDisplay(appt)}?`
        );
        if (!ok) return;

        setMarkingPaymentId(id);
        setError(null);

        try {
            const res = await fetch(`${API_BASE}/api/admin/service-appointments/${id}/payment`, {
                method: "PATCH",
                headers: await getAdminHeaders(),
                body: JSON.stringify({
                    paymentStatus: "Paid",
                    note: "Paid at clinic by cash",
                }),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok || body?.success === false) {
                throw new Error(body?.message || `Payment update failed (${res.status})`);
            }

            const updated = body?.appointment || body?.data || null;
            setAppointments((prev) =>
                prev.map((p) =>
                    p.id === id
                        ? updated
                            ? mapServiceAppointment(updated)
                            : {
                                ...p,
                                paymentStatus: "Paid",
                                payment: { ...p.payment, status: "Paid" },
                            }
                        : p
                )
            );
            pushToast("Payment updated", `Cash payment for appointment #${id} is now Paid`);
        } catch (err) {
            console.error("Service cash payment update error:", err);
            setError(err.message || "Failed to mark service cash payment paid");
            pushToast("Payment update failed", err.message || "Failed to mark cash payment paid");
        } finally {
            setMarkingPaymentId("");
        }
    }

    function setResultFormField(field, value) {
        setResultEditor((prev) => ({
            ...prev,
            form: {
                ...prev.form,
                [field]: value,
            },
        }));
    }

    function closeResultEditor() {
        setResultEditor({
            open: false,
            appointment: null,
            loading: false,
            saving: false,
            error: "",
            form: { ...EMPTY_RESULT_FORM },
        });
    }

    async function openResultEditor(appointment) {
        setResultEditor({
            open: true,
            appointment,
            loading: true,
            saving: false,
            error: "",
            form: {
                ...EMPTY_RESULT_FORM,
                resultTitle: `${appointment.serviceName || "Service"} Result`,
            },
        });

        try {
            const res = await fetch(`${API_BASE}/api/admin/service-appointments/${appointment.id}/result`, {
                headers: await getAdminHeaders(),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok || body?.success === false) {
                throw new Error(body?.message || `Failed to load result (${res.status})`);
            }

            const result = normalizeResultFromApi(body.result || body.data);
            setResultByAppointmentId((prev) => ({ ...prev, [appointment.id]: result }));
            setResultEditor((prev) => ({
                ...prev,
                loading: false,
                form: result
                    ? {
                        resultTitle: result.resultTitle || `${appointment.serviceName || "Service"} Result`,
                        resultSummary: result.resultSummary || "",
                        resultValuesJson: resultValuesToJson(result.resultValues),
                        resultFileUrl: result.resultFileUrl || "",
                        resultStatus: result.resultStatus || "Draft",
                        resultFile: null,
                    }
                    : {
                        ...EMPTY_RESULT_FORM,
                        resultTitle: `${appointment.serviceName || "Service"} Result`,
                    },
            }));
        } catch (err) {
            setResultEditor((prev) => ({
                ...prev,
                loading: false,
                error: err.message || "Failed to load result",
            }));
        }
    }

    async function saveResultWithStatus(statusOverride = "Draft", { quiet = false } = {}) {
        const appointment = resultEditor.appointment;
        const form = resultEditor.form;
        if (!appointment) return null;

        const resultTitle = String(form.resultTitle || "").trim();
        if (!resultTitle) {
            setResultEditor((prev) => ({ ...prev, error: "Result Title is required." }));
            return null;
        }

        const valuesText = String(form.resultValuesJson || "").trim();
        if (valuesText) {
            try {
                JSON.parse(valuesText);
            } catch {
                setResultEditor((prev) => ({ ...prev, error: "Result Values must be valid JSON." }));
                return null;
            }
        }

        setResultEditor((prev) => ({ ...prev, saving: true, error: "" }));

        try {
            const payload = new FormData();
            payload.append("result_title", resultTitle);
            payload.append("result_summary", String(form.resultSummary || "").trim());
            payload.append("result_values", valuesText || "");
            payload.append("result_file_url", String(form.resultFileUrl || "").trim());
            payload.append("result_status", statusOverride);
            if (form.resultFile) {
                payload.append("resultFile", form.resultFile);
            }

            const res = await fetch(`${API_BASE}/api/admin/service-appointments/${appointment.id}/result`, {
                method: "PUT",
                headers: await getAdminHeaders({ json: false }),
                body: payload,
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok || body?.success === false) {
                throw new Error(body?.message || `Failed to save result (${res.status})`);
            }

            const result = normalizeResultFromApi(body.result || body.data);
            setResultByAppointmentId((prev) => ({ ...prev, [appointment.id]: result }));
            setResultEditor((prev) => ({
                ...prev,
                saving: false,
                form: {
                    ...prev.form,
                    resultStatus: result?.resultStatus || statusOverride,
                    resultFile: null,
                    resultFileUrl: result?.resultFileUrl || prev.form.resultFileUrl,
                },
            }));

            if (!quiet) {
                pushToast("Result saved", `Result for appointment #${appointment.id} was saved as ${statusOverride}.`);
            }

            return result;
        } catch (err) {
            setResultEditor((prev) => ({
                ...prev,
                saving: false,
                error: err.message || "Failed to save result",
            }));
            if (!quiet) {
                pushToast("Result save failed", err.message || "Failed to save result");
            }
            return null;
        }
    }

    async function publishCurrentResult() {
        const appointment = resultEditor.appointment;
        if (!appointment) return;

        const paymentStatus = String(appointment.paymentStatus || "").toLowerCase();
        if (paymentStatus !== "paid") {
            const ok = window.confirm(
                "This service payment is not marked Paid. Publish the result anyway? This will not change payment status."
            );
            if (!ok) return;
        }

        const saved = await saveResultWithStatus("Draft", { quiet: true });
        if (!saved) return;

        setResultEditor((prev) => ({ ...prev, saving: true, error: "" }));

        try {
            const res = await fetch(`${API_BASE}/api/admin/service-appointments/${appointment.id}/result/publish`, {
                method: "PATCH",
                headers: await getAdminHeaders(),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok || body?.success === false) {
                throw new Error(body?.message || `Failed to publish result (${res.status})`);
            }

            const result = normalizeResultFromApi(body.result || body.data);
            setResultByAppointmentId((prev) => ({ ...prev, [appointment.id]: result }));
            setResultEditor((prev) => ({
                ...prev,
                saving: false,
                form: {
                    ...prev.form,
                    resultStatus: "Available",
                    resultFileUrl: result?.resultFileUrl || prev.form.resultFileUrl,
                    resultFile: null,
                },
            }));
            pushToast("Result published", `Result for appointment #${appointment.id} is now Available.`);
        } catch (err) {
            setResultEditor((prev) => ({
                ...prev,
                saving: false,
                error: err.message || "Failed to publish result",
            }));
            pushToast("Publish failed", err.message || "Failed to publish result");
        }
    }

    async function hideCurrentResult() {
        const appointment = resultEditor.appointment;
        if (!appointment) return;

        const existingStatus = resultByAppointmentId[appointment.id]?.resultStatus || resultEditor.form.resultStatus || "Draft";
        const saved = await saveResultWithStatus(existingStatus, { quiet: true });
        if (!saved) return;

        setResultEditor((prev) => ({ ...prev, saving: true, error: "" }));

        try {
            const res = await fetch(`${API_BASE}/api/admin/service-appointments/${appointment.id}/result/hide`, {
                method: "PATCH",
                headers: await getAdminHeaders(),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok || body?.success === false) {
                throw new Error(body?.message || `Failed to hide result (${res.status})`);
            }

            const result = normalizeResultFromApi(body.result || body.data);
            setResultByAppointmentId((prev) => ({ ...prev, [appointment.id]: result }));
            setResultEditor((prev) => ({
                ...prev,
                saving: false,
                form: {
                    ...prev.form,
                    resultStatus: "Hidden",
                    resultFileUrl: result?.resultFileUrl || prev.form.resultFileUrl,
                    resultFile: null,
                },
            }));
            pushToast("Result hidden", `Result for appointment #${appointment.id} is now Hidden.`);
        } catch (err) {
            setResultEditor((prev) => ({
                ...prev,
                saving: false,
                error: err.message || "Failed to hide result",
            }));
            pushToast("Hide failed", err.message || "Failed to hide result");
        }
    }

    // To update the status
    async function changeStatusRemote(id, newStatus) {
        const old = appointments.find((a) => a.id === id);
        if (!old) return;
        if (old.status === "Completed" || old.status === "Canceled") {
            pushToast(
                "Cannot change status",
                `Appointment #${id} is already ${old.status}.`
            );
            return;
        }

        setAppointments((prev) =>
            prev.map((a) => (a.id === id ? { ...a, status: newStatus } : a))
        );
        pushToast("Updating status", `Appointment #${id} → ${newStatus}`);

        try {
            const res = await fetch(`${API_BASE}/api/service-appointments/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: newStatus }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(
                    body?.message || `Status update failed (${res.status})`
                );
            }
            const body = await res.json();
            const updated = extractUpdated(body);

            setAppointments((prev) =>
                prev.map((a) =>
                    a.id === id
                        ? updated?.id || updated?._id
                            ? mapServiceAppointment(updated)
                            : {
                            ...a,
                            status: updated.status || newStatus,
                            date: updated.date || updated.rescheduledTo?.date || a.date,
                            hour: parseTimeToParts(
                                updated.time ||
                                updated.rescheduledTo?.time ||
                                a.raw?.time ||
                                formatTimeDisplay(a)
                            ).hour,
                            minute: parseTimeToParts(
                                updated.time ||
                                updated.rescheduledTo?.time ||
                                a.raw?.time ||
                                formatTimeDisplay(a)
                            ).minute,
                            ampm: parseTimeToParts(
                                updated.time ||
                                updated.rescheduledTo?.time ||
                                a.raw?.time ||
                                formatTimeDisplay(a)
                            ).ampm,
                            raw: updated || a.raw,
                        }
                        : a
                )
            );
            pushToast("Status updated", `Appointment #${id} is now ${newStatus}`);
        } catch (err) {
            console.error("changeStatusRemote:", err);
            setAppointments((prev) =>
                prev.map((a) => (a.id === id ? { ...a, status: old.status } : a))
            );
            pushToast("Update failed", err.message || "Failed to update status");
        }
    }

    // To reshedule the appointment for later but not on previous days
    async function rescheduleRemote(id, dateStr, time24) {
        const appt = appointments.find((a) => a.id === id);
        if (!appt) return;
        const [hh, mm] = time24.split(":").map(Number);
        const hour12 = hh % 12 === 0 ? 12 : hh % 12;
        const ampm = hh >= 12 ? "PM" : "AM";
        const timeStr = `${formatTwo(hour12)}:${formatTwo(mm)} ${ampm}`;

        setAppointments((prev) =>
            prev.map((a) =>
                a.id === id
                    ? {
                        ...a,
                        date: dateStr,
                        hour: hour12,
                        minute: mm,
                        ampm,
                        status: "Rescheduled",
                    }
                    : a
            )
        );

        pushToast(
            "Rescheduling",
            `Appointment #${id} → ${formatDateNice(dateStr)} ${timeStr}`
        );

        try {
            const res = await fetch(`${API_BASE}/api/service-appointments/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    rescheduledTo: { date: dateStr, time: timeStr },
                    status: "Rescheduled",
                }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body?.message || `Reschedule failed (${res.status})`);
            }
            const body = await res.json();
            const updated = extractUpdated(body);

            const finalDate =
                updated.date || updated.rescheduledTo?.date || dateStr || appt.date;
            const finalTimeStr =
                updated.time ||
                updated.rescheduledTo?.time ||
                timeStr ||
                formatTimeDisplay(appt);

            const parsed = parseTimeToParts(finalTimeStr);

            setAppointments((prev) =>
                prev.map((a) =>
                    a.id === id
                        ? updated?.id || updated?._id
                            ? mapServiceAppointment(updated)
                            : {
                            ...a,
                            date: finalDate,
                            hour: parsed.hour,
                            minute: parsed.minute,
                            ampm: parsed.ampm,
                            status: updated.status || "Rescheduled",
                            raw: updated || a.raw,
                        }
                        : a
                )
            );
            pushToast(
                "Rescheduled",
                `Appointment #${id} moved to ${formatDateNice(
                    finalDate
                )} ${finalTimeStr}`
            );
        } catch (err) {
            console.error("rescheduleRemote:", err);
            pushToast(
                "Reschedule failed",
                err.message || "Failed to reschedule — reloading"
            );
            await fetchAppointments();
        }
    }

    // To cancel any appointment
    async function cancelRemote(id) {
        const appt = appointments.find((a) => a.id === id);
        if (!appt) return;
        if (appt.status === "Canceled") return;
        if (
            !window.confirm(
                `Mark appointment for ${appt.patientName} on ${formatDateNice(
                    appt.date
                )} as CANCELED?`
            )
        )
            return;

        setAppointments((prev) =>
            prev.map((a) => (a.id === id ? { ...a, status: "Canceled" } : a))
        );
        pushToast("Canceling", `Appointment #${id} is being canceled`);

        try {
            const res = await fetch(
                `${API_BASE}/api/service-appointments/${id}/cancel`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                }
            );
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body?.message || `Cancel failed (${res.status})`);
            }
            const body = await res.json();
            const updated = extractUpdated(body);
            setAppointments((prev) =>
                prev.map((a) =>
                    a.id === id
                        ? updated?.id || updated?._id
                            ? mapServiceAppointment(updated)
                            : {
                                ...a,
                                status: updated.status || "Canceled",
                                raw: updated || a.raw,
                            }
                        : a
                )
            );
            pushToast("Canceled", `Appointment #${id} canceled`);
        } catch (err) {
            console.error("cancelRemote:", err);
            pushToast("Cancel failed", err.message || "Failed to cancel — reloading");
            await fetchAppointments();
        }
    }

    // To filter
    const filtered = useMemo(() => {
        const q = debouncedSearch.toLowerCase();
        return appointments
            .filter((a) =>
                q
                    ? (a.patientName || "").toLowerCase().includes(q) ||
                    (a.serviceName || "").toLowerCase().includes(q)
                    : true
            )
            .filter((a) => (statusFilter ? a.status === statusFilter : true));
    }, [appointments, debouncedSearch, statusFilter]);

    // To get timestamp for sorting appointments by date and time (upcoming first)
    function getTimestamp(a) {
        try {
            const [y, m, d] = (a.date || "1970-01-01").split("-").map(Number);
            let hour = Number(a.hour) || 0;
            if ((a.ampm || "AM") === "PM" && hour !== 12) hour += 12;
            if ((a.ampm || "AM") === "AM" && hour === 12) hour = 0;
            const minute = Number(a.minute) || 0;
            return new Date(y, (m || 1) - 1, d || 1, hour, minute).getTime();
        } catch {
            return 0;
        }
    }
    // Sort that is upcoming date comes first
    const displayList = useMemo(() => {
        const copy = filtered.slice();
        copy.sort((x, y) => getTimestamp(y) - getTimestamp(x));
        return copy;
    }, [filtered]);

    return (
        <div className={serviceAppointmentsStyles.container}>
            <header className={serviceAppointmentsStyles.headerContainer}>
                <div className={serviceAppointmentsStyles.headerTitleContainer}>
                    <h1 className={serviceAppointmentsStyles.headerTitle}>
                        Service Appointments
                    </h1>
                    <p className={serviceAppointmentsStyles.headerSubtitle}>
                        View, manage, and reschedule service appointments with ease.
                    </p>
                </div>

                <div className={serviceAppointmentsStyles.searchContainer}>
                    <div className={serviceAppointmentsStyles.searchInputWrapper}>
                        <label className={serviceAppointmentsStyles.searchLabel}>
                            <span className=' sr-only'>
                                Search by patient or service name
                            </span>
                            <div className=' flex items-center gap-2 relative w-full'>
                                <div className={serviceAppointmentsStyles.searchIconContainer}>
                                    <SearchIcon className={serviceAppointmentsStyles.searchIcon} />
                                </div>
                                <input
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder='Search by patient or service...'
                                    className={serviceAppointmentsStyles.searchInput}
                                />
                                {search ? (
                                    <button
                                        className={serviceAppointmentsStyles.clearSearchButton}
                                        onClick={() => setSearch("")}>
                                        <XIcon className={serviceAppointmentsStyles.clearSearchIcon}
                                        />
                                    </button>
                                ) : null}
                            </div>
                        </label>

                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className={serviceAppointmentsStyles.statusFilterSelect}
                            title="Filter by status"
                        >
                            <option value="">All</option>
                            <option value="Pending">Pending</option>
                            <option value="Confirmed">Confirmed</option>
                            <option value="Rescheduled">Rescheduled</option>
                            <option value="Completed">Completed</option>
                            <option value="Canceled">Canceled</option>
                        </select>
                    </div>

                    <div className={serviceAppointmentsStyles.searchInfo}>
                        <div>
                            {displayList.length} result{displayList.length !== 1 ? "s" : ""}
                        </div>
                        <div>
                            <button
                                onClick={fetchAppointments}
                                className={serviceAppointmentsStyles.refreshButton}
                            >
                                Refresh
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            {loading ? (
                <div className={serviceAppointmentsStyles.loadingContainer}>
                    <Loader2 className=' animate-spin' />
                    Loading appointments...
                </div>
            ) : error ? (
                <div className={serviceAppointmentsStyles.errorContainer}>{error}</div>
            ) : (
                <div className={serviceAppointmentsStyles.gridContainer}>
                    {displayList.length === 0 ? (
                        <div className={serviceAppointmentsStyles.noResultsContainer}>
                            <div className={serviceAppointmentsStyles.noResultsIcon}>
                                <SearchIcon />
                            </div>
                            <div className={serviceAppointmentsStyles.noResultsText}>
                                No appointments found.
                            </div>
                            <div className={serviceAppointmentsStyles.noResultsSubtext}>
                                Try a different patient name or service
                            </div>
                        </div>
                    ) : (
                        displayList.map((a) => {
                            const isLocked = a.status === "Completed" || a.status === "Canceled";
                            const isCanceled = a.status === "Canceled";
                            const paymentStatusLower = String(a.paymentStatus || "").toLowerCase();
                            const isCash = String(a.paymentMethod || "").toLowerCase() === "cash";
                            const isCashPending = isCash && (paymentStatusLower === "pending" || paymentStatusLower === "unpaid");
                            const isMarkingPayment = markingPaymentId === a.id;
                            const result = resultByAppointmentId[a.id] || null;
                            const resultStatusLabel = result?.resultStatus || "No Result";
                            return (
                                <article key={a.id} className={serviceAppointmentsStyles.article}>
                                    <div className={serviceAppointmentsStyles.cardInner}>
                                        <div>
                                            <div className={serviceAppointmentsStyles.cardHeader}>
                                                <div className={serviceAppointmentsStyles.patientInfoContainer}>
                                                    <div className={serviceAppointmentsStyles.patientAvatar}>
                                                        <User className={serviceAppointmentsStyles.patientAvatarIcon} />
                                                    </div>

                                                    <div className={serviceAppointmentsStyles.patientInfo}>
                                                        <div className={serviceAppointmentsStyles.patientName}>
                                                            {a.patientName}
                                                        </div>
                                                        <div className={serviceAppointmentsStyles.patientDetails}>
                                                            {a.gender} • {a.age} yrs
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className={serviceAppointmentsStyles.statusContainer}>
                                                    <div className="mt-1">
                                                        <StatusSelect
                                                            appointment={a}
                                                            onChange={(s) => changeStatusRemote(a.id, s)}
                                                            disabled={false}
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            <div className={serviceAppointmentsStyles.detailsContainer}>
                                                <div className={serviceAppointmentsStyles.detailStatusRow}>
                                                    <StatusBadge status={a.status} />
                                                </div>

                                                <div className={serviceAppointmentsStyles.detailItem}>
                                                    <Phone className={serviceAppointmentsStyles.detailIcon} />
                                                    <span className={serviceAppointmentsStyles.detailText}>
                                                        {a.mobile}
                                                    </span>
                                                </div>

                                                <div className={serviceAppointmentsStyles.detailItem}>
                                                    <DollarSign className={serviceAppointmentsStyles.detailIcon} />
                                                    <span className={serviceAppointmentsStyles.feesText}>
                                                        Fees: ${a.fees}
                                                    </span>
                                                </div>

                                                <div className={serviceAppointmentsStyles.detailItem}>
                                                    <CreditCard className={serviceAppointmentsStyles.detailIcon} />
                                                    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${paymentBadgeClasses(a.paymentStatus)}`}>
                                                        Payment: {a.paymentMethod} - {a.paymentStatus}
                                                    </span>
                                                </div>

                                                <div className={serviceAppointmentsStyles.detailItem}>
                                                    <FileText className={serviceAppointmentsStyles.detailIcon} />
                                                    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${resultBadgeClasses(result?.resultStatus)}`}>
                                                        Result: {resultStatusLabel}
                                                    </span>
                                                </div>

                                                <div className={serviceAppointmentsStyles.detailItem}>
                                                    <Calendar className={serviceAppointmentsStyles.detailIcon} />
                                                    <span className={serviceAppointmentsStyles.detailText}>
                                                        Date: {formatDateNice(a.date)}
                                                    </span>
                                                </div>

                                                <div className={serviceAppointmentsStyles.detailItem}>
                                                    <Clock className={serviceAppointmentsStyles.detailIcon} />
                                                    <span className={serviceAppointmentsStyles.detailText}>
                                                        Time: {formatTimeDisplay(a)}
                                                    </span>
                                                </div>

                                                <div className={serviceAppointmentsStyles.serviceText}>
                                                    Service:{" "}
                                                    <span className={serviceAppointmentsStyles.serviceName}>
                                                        {a.serviceName}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className={serviceAppointmentsStyles.actionsContainer}>
                                            <div className={serviceAppointmentsStyles.actionsInnerContainer}>
                                                <div>
                                                    <button
                                                        onClick={() => openResultEditor(a)}
                                                        className="inline-flex h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-blue-50 px-3.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-100 hover:shadow-sm"
                                                    >
                                                        <FileText className="h-4 w-4" />
                                                        Result
                                                    </button>
                                                </div>

                                                <div className="flex-none">
                                                    <RescheduleButton
                                                        appointment={a}
                                                        onReschedule={(d, t) =>
                                                            rescheduleRemote(a.id, d, t)
                                                        }
                                                        disabled={false}
                                                    />
                                                </div>

                                                {isCashPending && !isCanceled && (
                                                    <div className="flex-none">
                                                        <button
                                                            onClick={() => markCashServicePaymentPaid(a.id)}
                                                            disabled={Boolean(markingPaymentId)}
                                                            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-emerald-50 px-3.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                                                        >
                                                            {isMarkingPayment ? "Marking..." : "Mark Cash Paid"}
                                                        </button>
                                                    </div>
                                                )}

                                                <div className="flex-none">
                                                    <button
                                                        onClick={() => cancelRemote(a.id)}
                                                        disabled={isLocked}
                                                        className={serviceAppointmentsStyles.cancelButton(isLocked)}
                                                        title={
                                                            isLocked ? "Cannot cancel" : "Cancel appointment"
                                                        }
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </article>
                            );
                        })
                    )}
                </div>
            )}

            {resultEditor.open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
                    <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl border border-slate-100">
                        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-100 bg-white px-6 py-4">
                            <div>
                                <h2 className="text-xl font-bold text-slate-900">Service Test Result</h2>
                                <p className="text-sm text-slate-500">
                                    {resultEditor.appointment?.patientName} - {resultEditor.appointment?.serviceName}
                                </p>
                            </div>
                            <button
                                onClick={closeResultEditor}
                                className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
                                aria-label="Close result editor"
                            >
                                <XIcon className="h-5 w-5" />
                            </button>
                        </div>

                        {resultEditor.loading ? (
                            <div className="flex items-center justify-center gap-3 px-6 py-12 text-slate-600">
                                <Loader2 className="h-5 w-5 animate-spin" />
                                Loading result...
                            </div>
                        ) : (
                            <div className="space-y-5 px-6 py-5">
                                {String(resultEditor.appointment?.paymentStatus || "").toLowerCase() !== "paid" && (
                                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                                        Payment is currently {resultEditor.appointment?.paymentStatus || "Pending"}. Publishing a result will not update payment status.
                                    </div>
                                )}

                                {resultEditor.error && (
                                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                                        {resultEditor.error}
                                    </div>
                                )}

                                <div className="grid gap-4 sm:grid-cols-2">
                                    <label className="space-y-1.5">
                                        <span className="text-sm font-semibold text-slate-700">Result Title</span>
                                        <input
                                            value={resultEditor.form.resultTitle}
                                            onChange={(e) => setResultFormField("resultTitle", e.target.value)}
                                            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                                            placeholder="Diabetes Test Result"
                                        />
                                    </label>

                                    <label className="space-y-1.5">
                                        <span className="text-sm font-semibold text-slate-700">Status</span>
                                        <select
                                            value={resultEditor.form.resultStatus}
                                            onChange={(e) => setResultFormField("resultStatus", e.target.value)}
                                            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                                        >
                                            <option value="Draft">Draft</option>
                                            <option value="Available">Available</option>
                                            <option value="Hidden">Hidden</option>
                                        </select>
                                    </label>
                                </div>

                                <label className="block space-y-1.5">
                                    <span className="text-sm font-semibold text-slate-700">Result Summary</span>
                                    <textarea
                                        value={resultEditor.form.resultSummary}
                                        onChange={(e) => setResultFormField("resultSummary", e.target.value)}
                                        rows={4}
                                        className="w-full resize-y rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                                        placeholder="Enter the clinic/lab summary exactly as provided."
                                    />
                                </label>

                                <label className="block space-y-1.5">
                                    <span className="text-sm font-semibold text-slate-700">Result Values JSON</span>
                                    <textarea
                                        value={resultEditor.form.resultValuesJson}
                                        onChange={(e) => setResultFormField("resultValuesJson", e.target.value)}
                                        rows={7}
                                        spellCheck={false}
                                        className="w-full resize-y rounded-xl border border-slate-200 px-3 py-2 font-mono text-xs outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                                        placeholder='{"fasting_glucose":"95 mg/dL"}'
                                    />
                                </label>

                                <div className="grid gap-4 sm:grid-cols-2">
                                    <label className="space-y-1.5">
                                        <span className="text-sm font-semibold text-slate-700">Result File URL</span>
                                        <input
                                            value={resultEditor.form.resultFileUrl}
                                            onChange={(e) => setResultFormField("resultFileUrl", e.target.value)}
                                            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                                            placeholder="https://..."
                                        />
                                    </label>

                                    <label className="space-y-1.5">
                                        <span className="text-sm font-semibold text-slate-700">Upload PDF/Image</span>
                                        <div className="flex items-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-600">
                                            <Upload className="h-4 w-4 text-slate-400" />
                                            <input
                                                type="file"
                                                accept="application/pdf,image/png,image/jpeg,image/jpg,image/webp"
                                                onChange={(e) => setResultFormField("resultFile", e.target.files?.[0] || null)}
                                                className="min-w-0 flex-1 text-xs"
                                            />
                                        </div>
                                    </label>
                                </div>

                                {resultEditor.form.resultFileUrl && (
                                    <a
                                        href={resultEditor.form.resultFileUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-2 text-sm font-semibold text-blue-700 hover:underline"
                                    >
                                        <ExternalLink className="h-4 w-4" />
                                        Open current result file
                                    </a>
                                )}

                                <div className="flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
                                    <button
                                        onClick={() => saveResultWithStatus("Draft")}
                                        disabled={resultEditor.saving}
                                        className="rounded-full border border-amber-200 px-5 py-2.5 text-sm font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-60"
                                    >
                                        Save Draft
                                    </button>
                                    <button
                                        onClick={hideCurrentResult}
                                        disabled={resultEditor.saving}
                                        className="rounded-full border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                                    >
                                        Hide Result
                                    </button>
                                    <button
                                        onClick={publishCurrentResult}
                                        disabled={resultEditor.saving}
                                        className="rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                                    >
                                        {resultEditor.saving ? "Saving..." : "Publish Result"}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <Toast toasts={toasts} removeToast={removeToast} />
            <div className={serviceAppointmentsStyles.legendContainer}>
                <div className={serviceAppointmentsStyles.legendItem}>
                    <div
                        className={`${serviceAppointmentsStyles.legendDot} bg-amber-400`}
                    />{" "}
                    <span>Pending</span>
                </div>

                <div className={serviceAppointmentsStyles.legendItem}>
                    <div
                        className={`${serviceAppointmentsStyles.legendDot} bg-green-400`}
                    />{" "}
                    <span>Confirmed</span>
                </div>

                <div className={serviceAppointmentsStyles.legendItem}>
                    <div
                        className={`${serviceAppointmentsStyles.legendDot} bg-red-400`}
                    />{" "}
                    <span>Cancelled</span>
                </div>

                <div className={serviceAppointmentsStyles.legendItem}>
                    <div
                        className={`${serviceAppointmentsStyles.legendDot} bg-sky-400`}
                    />{" "}
                    <span>Completed</span>
                </div>

                <div className={serviceAppointmentsStyles.legendItem}>
                    <div
                        className={`${serviceAppointmentsStyles.legendDot} bg-indigo-400`}
                    />{" "}
                    <span>Rescheduled</span>
                </div>
            </div>

            <style>{serviceAppointmentsStyles.animatedBorderStyle}</style>
        </div>
    );
}

export default ServiceAppointmentsPage;
