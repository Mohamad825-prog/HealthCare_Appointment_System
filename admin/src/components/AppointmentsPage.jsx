import React, { useEffect, useMemo, useState } from 'react'
import { useAuth, useUser } from '@clerk/clerk-react';
import { pageStyles, statusClasses, keyframesStyles } from '../assets/dummyStyles';
import { Search, Calendar, DollarSign, CreditCard } from 'lucide-react';

const API_BASE = "http://localhost:4000";

// Helper function

// to format ISO date string to "DD MMM YYYY"
function formatDateISO(iso) {
    try {
        const d = new Date(iso + "T00:00:00");
        return d.toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
        });
    } catch (e) {
        return iso;
    }
}

// Helper function to convert slot {date: "YYYY-MM-DD", time: "HH:MM AM/PM"} to Date object
function dateTimeFromSlot(slot) {
    try {
        const [y, m, d] = slot.date.split("-");
        const base = new Date(Number(y), Number(m) - 1, Number(d), 0, 0, 0, 0);

        const [time, ampm] = slot.time.split(" ");
        let [hh, mm] = time.split(":").map(Number);
        if (ampm === "PM" && hh !== 12) hh += 12;
        if (ampm === "AM" && hh === 12) hh = 0;
        base.setHours(hh, mm, 0, 0);
        return base;
    } catch (e) {
        return new Date(slot.date + "T00:00:00");
    }
}

function mapAppointment(a) {
    const doctorName =
        (a.doctorId && a.doctorId.name) || a.doctorName || "";
    const speciality =
        (a.doctorId && a.doctorId.specialization) ||
        a.speciality ||
        a.specialization ||
        "General";
    const payment = a.payment || {};
    const fee = typeof a.fees === "number" ? a.fees : a.fee || payment.amount || 0;

    return {
        id: a._id || a.id,
        patientName: a.patientName || "",
        age: a.age || "",
        gender: a.gender || "",
        mobile: a.mobile || "",
        doctorName,
        speciality,
        fee,
        slot: {
            date: a.date || (a.slot && a.slot.date) || "",
            time: a.time || (a.slot && a.slot.time) || "00:00 AM",
        },
        status: a.status || "Pending",
        payment,
        paymentMethod: payment.method || "Online",
        paymentStatus: payment.status || "Pending",
        paidAt: a.paidAt || payment.paidAt || null,
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

const AppointmentsPage = () => {

    const isAdmin = true; // As the admin is logged in and is Major Admin for response send by him
    const { getToken } = useAuth();
    const { user } = useUser();

    const [appointments, setAppointments] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [markingPaymentId, setMarkingPaymentId] = useState("");

    const [query, setQuery] = useState("");
    const [filterDate, setFilterDate] = useState("");
    const [filterSpeciality, setFilterSpeciality] = useState("all");
    const [showAll, setShowAll] = useState(false);

    // Fetch list from backend
    useEffect(() => {
        async function load() {
            setLoading(true);
            setError(null);
            try {
                const q = query.trim();
                const url = `${API_BASE}/api/appointments?limit=200${q ? `&search=${encodeURIComponent(q)}` : ""
                    }`;
                const res = await fetch(url);
                if (!res.ok) {
                    const body = await res.json().catch(() => ({}));
                    throw new Error(body?.message || `Failed to fetch (${res.status})`);
                }
                const data = await res.json();
                const items = (data?.appointments || []).map(mapAppointment);
                setAppointments(items); // Set the fetched appointments to state
            } catch (err) {
                console.error("Load appointments error:", err);
                setError(err.message || "Failed to load appointments");
            } finally {
                setLoading(false);
            }
        }
        load();
    }, []);

    // Compute available specialities from fetched appointments
    const specialities = useMemo(() => {
        const set = new Set(appointments.map((a) => a.speciality || "General"));
        return ["all", ...Array.from(set)];
    }, [appointments]);

    // Filter and sort appointments based on query and selected filters
    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return appointments.filter((a) => {
            if (
                filterSpeciality !== "all" &&
                (a.speciality || "").toLowerCase() !== filterSpeciality.toLowerCase()
            )
                return false;
            if (filterDate && a.slot?.date !== filterDate) return false;
            if (!q) return true;
            return (
                (a.doctorName || "").toLowerCase().includes(q) ||
                (a.speciality || "").toLowerCase().includes(q) ||
                (a.patientName || "").toLowerCase().includes(q) ||
                (a.mobile || "").toLowerCase().includes(q)
            );
        });
    }, [appointments, query, filterDate, filterSpeciality]);

    // Sort filtered appointments by date and time
    const sortedFiltered = useMemo(() => {
        return filtered.slice().sort((a, b) => {
            const da = dateTimeFromSlot(a.slot).getTime();
            const db = dateTimeFromSlot(b.slot).getTime();
            return db - da;
        });
    }, [filtered]);

    // Display all the appointments or the filtered ones
    const displayed = useMemo(
        () => (showAll ? sortedFiltered : sortedFiltered.slice(0, 8)),
        [sortedFiltered, showAll]
    );

    // If Admin want to cancel the appointment
    async function adminCancelAppointment(id) {
        const appt = appointments.find((x) => x.id === id);
        if (!appt) return;

        const statusLower = (appt.status || "").toLowerCase();
        const isCancelled =
            statusLower === "canceled" || statusLower === "cancelled";
        const isCompleted = statusLower === "completed";

        // If already cancelled or completed, do nothing
        if (isCancelled || isCompleted) return;

        const ok = window.confirm(
            `As admin, mark appointment for ${appt.patientName} with ${appt.doctorName
            } on ${formatDateISO(appt.slot.date)} at ${appt.slot.time} as CANCELLED?`
        );
        if (!ok) return;

        try {
            setAppointments((prev) =>
                prev.map((p) => (p.id === id ? { ...p, status: "Canceled" } : p))
            );
            setShowAll(true);

            const res = await fetch(`${API_BASE}/api/appointments/${id}/cancel`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body?.message || `Cancel failed (${res.status})`);
            }
            const data = await res.json();
            const updated = data?.appointment || data?.appointments || null;
            if (updated) {
                setAppointments((prev) =>
                    prev.map((p) => (p.id === id ? mapAppointment(updated) : p))
                );
            }
        } catch (err) {
            console.error("Cancel error:", err);
            setError(err.message || "Failed to cancel appointment");
            try {
                const reload = await fetch(`${API_BASE}/api/appointments?limit=200`);
                if (reload.ok) {
                    const body = await reload.json();
                    const items = (body?.appointments || []).map(mapAppointment);
                    setAppointments(items);
                }
            } catch (e) {
                // Ignore reload errors
            }
        }
    }

    async function getAdminHeaders() {
        const headers = { "Content-Type": "application/json" };

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

    async function markCashPaymentPaid(id) {
        const appt = appointments.find((x) => x.id === id);
        if (!appt) return;

        const ok = window.confirm(
            `Mark cash payment as PAID for ${appt.patientName} with ${appt.doctorName} on ${formatDateISO(appt.slot.date)} at ${appt.slot.time}?`
        );
        if (!ok) return;

        setMarkingPaymentId(id);
        setError(null);

        try {
            const res = await fetch(`${API_BASE}/api/admin/appointments/${id}/payment`, {
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

            const updated = body?.appointment || null;
            setAppointments((prev) =>
                prev.map((p) =>
                    p.id === id
                        ? updated
                            ? mapAppointment(updated)
                            : {
                                ...p,
                                paymentStatus: "Paid",
                                payment: { ...p.payment, status: "Paid" },
                            }
                        : p
                )
            );
        } catch (err) {
            console.error("Cash payment update error:", err);
            setError(err.message || "Failed to mark cash payment paid");
        } finally {
            setMarkingPaymentId("");
        }
    }

    return (
        <div className={pageStyles.container}>
            <style>{keyframesStyles}</style>
            <div className={pageStyles.maxWidthContainer}>
                <header className={pageStyles.headerContainer}>
                    <div className={pageStyles.headerTitleSection}>
                        <h1 className={pageStyles.headerTitle}>Appointments</h1>
                        <p className={pageStyles.headerSubtitle}>
                            View appointment status separately from payment status, cancel appointments, and confirm cash payments received at the clinic.
                        </p>
                    </div>

                    <div className={pageStyles.headerControlsSection}>
                        <div className='flex flex-col md:flex-col sm:flex-row items-center gap-3
                         w-full sm:w-auto'>
                            <div className={pageStyles.searchContainer}>
                                <Search size={16} className={pageStyles.searchIcon} />
                                <input
                                    className={pageStyles.searchInput}
                                    placeholder='Search doctor, patient, speciality or mobile'
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                />
                            </div>
                            <div className={pageStyles.filterContainer}>
                                <div className={pageStyles.dateFilter}>
                                    <Calendar size={14} className={pageStyles.dateFilterIcon} />
                                    <input
                                        type="date"
                                        className={pageStyles.dateInput}
                                        value={filterDate}
                                        onChange={(e) => setFilterDate(e.target.value)}
                                    />
                                </div>

                                <select className={pageStyles.selectFilter}
                                    value={filterSpeciality} onChange={(e) => setFilterSpeciality(e.target.value)}
                                >
                                    {specialities.map((s) => (
                                        <option value={s} key={s}>
                                            {s === "all" ? "All Specialities" : s}
                                        </option>
                                    ))}
                                </select>

                                <button
                                    onClick={() => {
                                        setQuery("");
                                        setFilterDate("");
                                        setFilterSpeciality("all");
                                        setShowAll(false);
                                        setError(null);
                                    }} className={pageStyles.clearButton}
                                >
                                    Clear Filters
                                </button>
                            </div>
                        </div>
                    </div>
                </header>

                {loading ? (
                    <div className={pageStyles.loadingErrorContainer}>Loading...</div>
                ) : error ? (
                    <div className={pageStyles.errorContainer}>{error}</div>
                ) : sortedFiltered.length === 0 ? (
                    <div className={pageStyles.noResultsContainer}>
                        No appointments found.
                    </div>
                ) : (
                    <main className={pageStyles.gridContainer}>
                        {displayed.map((a, idx) => {
                            const statusLower = (a.status || "").toLowerCase();
                            const isCancelled =
                                statusLower === "canceled" || statusLower === "cancelled";
                            const isCompleted = statusLower === "completed";
                            const isDisabled = isCancelled || isCompleted;
                            const paymentStatusLower = String(a.paymentStatus || "").toLowerCase();
                            const isCash = String(a.paymentMethod || "").toLowerCase() === "cash";
                            const isCashPending = isCash && (paymentStatusLower === "pending" || paymentStatusLower === "unpaid");
                            const isMarkingPayment = markingPaymentId === a.id;

                            return (
                                <div
                                    key={a.id}
                                    style={{
                                        animation: `fadeUp 420ms cubic-bezier(.2,.9,.2,1) forwards`,
                                        animationDelay: `${idx * 70}ms`,
                                        opacity: 0,
                                    }}
                                    className={pageStyles.card}
                                >
                                    <div className={pageStyles.cardHeader}>
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h3 className={pageStyles.cardTitle}>
                                                    {a.patientName}
                                                </h3>

                                                <div className={pageStyles.patientInfo}>
                                                    <span>{a.age ? `${a.age} yrs` : ""}</span>
                                                    <span> {a.age ? ":" : ""} </span>
                                                    <span>{a.gender}</span>
                                                    <span className="hidden md:inline"> : </span>
                                                    <span className=" max-w-30">{a.mobile}</span>
                                                </div>
                                            </div>

                                            <div className={pageStyles.doctorInfo}>
                                                {a.doctorName} :{" "}
                                                <span className={pageStyles.doctorSpeciality}>
                                                    {a.speciality}
                                                </span>
                                            </div>
                                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                                <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${paymentBadgeClasses(a.paymentStatus)}`}>
                                                    <CreditCard size={13} />
                                                    Payment: {a.paymentMethod} - {a.paymentStatus}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="text-right">
                                            <div className={pageStyles.feeLabel}>
                                                Fees
                                            </div>
                                            <div className={pageStyles.feeAmount}>
                                                <DollarSign size={16} />
                                                <span>{a.fee}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between gap-3 flex-wrap">
                                        <div className={pageStyles.slotContainer}>
                                            <Calendar size={14} className={pageStyles.slotIcon} />
                                            <span>
                                                {formatDateISO(a.slot.date)} — {a.slot.time}
                                            </span>
                                        </div>

                                        <div
                                            className={`${pageStyles.statusBadge} ${statusClasses(a.status)}`}
                                        >
                                            {a.status ? a.status.toUpperCase() : "PENDING"}
                                        </div>

                                        <div className="flex items-center gap-2 flex-wrap">
                                            {isCashPending && !isCancelled && (
                                                <button
                                                    onClick={() => markCashPaymentPaid(a.id)}
                                                    disabled={Boolean(markingPaymentId)}
                                                    className="px-3 py-2 rounded-full text-sm flex items-center gap-2 transition bg-emerald-50 text-emerald-700 hover:scale-105 disabled:opacity-60 disabled:cursor-not-allowed"
                                                >
                                                    {isMarkingPayment ? "Marking..." : "Mark Cash Paid"}
                                                </button>
                                            )}
                                            {isAdmin && (
                                                <button
                                                    onClick={() => adminCancelAppointment(a.id)}
                                                    title={
                                                        isDisabled
                                                            ? isCompleted
                                                                ? "Cannot cancel a completed appointment"
                                                                : "Already cancelled"
                                                            : "Admin Cancel (mark as cancelled)"
                                                    }
                                                    disabled={isDisabled}
                                                    aria-disabled={isDisabled}
                                                    className={pageStyles.cancelButton(isDisabled, isCompleted)}
                                                >
                                                    {isDisabled
                                                        ? isCompleted
                                                            ? "Completed"
                                                            : "Admin Cancelled"
                                                        : "Admin Cancel"}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </main>
                )}

                {sortedFiltered.length > 8 && (
                    <div className=' flex justify-center mt-4'>
                        <button
                            onClick={() => setShowAll((s) => !s)}
                            className={pageStyles.showMoreButton}
                        >
                            {showAll
                                ? "Show Less"
                                : `Show more (${sortedFiltered.length - 8})`}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

export default AppointmentsPage;
