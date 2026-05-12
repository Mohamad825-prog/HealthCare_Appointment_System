import Stripe from "stripe";
import { getAuth } from "@clerk/express";
import { supabase } from "../config/supabase.js";
import {
    sendServiceAppointmentCreatedEmail,
    sendServiceCashPaymentConfirmedEmail,
} from "../utils/email.js";
import {
    calculateAgeFromDateOfBirth,
    fetchPatientProfileByClerkUserId,
    trimString,
} from "../utils/patientProfile.js";

const stripeKey = process.env.STRIPE_SECRET_KEY || null;
const stripe = stripeKey ? new Stripe(stripeKey, { apiVersion: "2022-11-15" }) : null;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAJOR_ADMIN_ID = process.env.MAJOR_ADMIN_ID || null;
const VALID_PAYMENT_STATUSES = ["Pending", "Paid", "Failed", "Refunded"];
const columnSupportCache = new Map();
const columnWarningCache = new Set();
const FLEXIBLE_SCHEDULE_SCHEMA_MESSAGE =
    "Database migration required: allow null values for service_appointments date, hour, minute, and ampm so services without fixed slots can be booked.";
const ZERO_DECIMAL_CURRENCIES = new Set([
    "bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga",
    "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf",
]);

function normalizeStripeCurrency(value) {
    const currency = String(value || "usd").trim().toLowerCase();
    return /^[a-z]{3}$/.test(currency) ? currency : "usd";
}

const STRIPE_CURRENCY = normalizeStripeCurrency(process.env.STRIPE_CURRENCY || "usd");

function toStripeUnitAmount(amount, currency = STRIPE_CURRENCY) {
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount)) return 0;
    return ZERO_DECIMAL_CURRENCIES.has(normalizeStripeCurrency(currency))
        ? Math.round(numericAmount)
        : Math.round(numericAmount * 100);
}

function fromStripeUnitAmount(amount, currency = STRIPE_CURRENCY) {
    const numericAmount = Number(amount || 0);
    return ZERO_DECIMAL_CURRENCIES.has(normalizeStripeCurrency(currency))
        ? numericAmount
        : Math.round(numericAmount) / 100;
}

// Helper functions
const safeNumber = (val) => {
    if (val === undefined || val === null || val === "") return null;
    const n = Number(val);
    return Number.isFinite(n) ? n : null;
};

const normalizeAppointmentStatus = (status) => String(status || "").trim();
const normalizePaymentMethod = (method) =>
    String(method || "").trim().toLowerCase() === "cash" ? "Cash" : "Online";
const normalizePaymentStatus = (status) => {
    const incoming = String(status || "").trim();
    return VALID_PAYMENT_STATUSES.find((item) => item.toLowerCase() === incoming.toLowerCase()) || "Pending";
};
const normalizeOptionalEmail = (value) => {
    const email = String(value || "").trim().toLowerCase();
    return EMAIL_REGEX.test(email) ? email : "";
};

const getAdminNotifyEmail = () => normalizeOptionalEmail(process.env.ADMIN_NOTIFY_EMAIL);
const isCanceledStatus = (status) => normalizeAppointmentStatus(status) === "Canceled";
const isCompletedStatus = (status) => normalizeAppointmentStatus(status) === "Completed";
const isTerminalAppointmentStatus = (status) => isCanceledStatus(status) || isCompletedStatus(status);

const hasPaymentMutation = (body = {}) =>
    body.payment !== undefined ||
    body.paymentStatus !== undefined ||
    body["payment.status"] !== undefined ||
    body.paidAt !== undefined ||
    body.paid_at !== undefined;

function buildPayment({
    method,
    status = "Pending",
    amount = 0,
    paidAt = null,
    confirmedBy = null,
    note = "",
    providerId = null,
    sessionId = null,
    extra = {},
}) {
    return {
        ...extra,
        method: normalizePaymentMethod(method),
        status: normalizePaymentStatus(status),
        amount: safeNumber(amount) ?? 0,
        paidAt,
        confirmedBy,
        ...(note ? { note } : {}),
        ...(providerId ? { providerId } : {}),
        ...(sessionId ? { sessionId } : {}),
    };
}

function getPaymentStatus(payment) {
    return normalizePaymentStatus(payment?.status || "Pending");
}

function getPaymentMethod(payment) {
    return normalizePaymentMethod(payment?.method || "Online");
}

function sanitizePaymentForResponse(payment) {
    if (!payment || typeof payment !== "object") return payment || null;
    const { sessionId, ...safePayment } = payment;
    return safePayment;
}

function resolveAdminIdentity(req) {
    const clerkUserId = resolveClerkUserId(req);
    if (clerkUserId) {
        return { id: clerkUserId, verifiedByClerk: true };
    }

    const headerAdminId = String(req.get("x-admin-id") || "").trim();
    if (headerAdminId) {
        return { id: headerAdminId, verifiedByClerk: false };
    }

    return { id: null, verifiedByClerk: false };
}

function validateAdminRequest(req, res) {
    if (!MAJOR_ADMIN_ID) {
        res.status(500).json({
            success: false,
            message: "Admin identity is not configured on the server.",
        });
        return null;
    }

    const adminIdentity = resolveAdminIdentity(req);
    if (!adminIdentity.id) {
        res.status(401).json({
            success: false,
            message: "Admin authorization required.",
        });
        return null;
    }

    if (String(adminIdentity.id) !== String(MAJOR_ADMIN_ID)) {
        res.status(403).json({
            success: false,
            message: "Only the configured admin can update service cash payment status.",
        });
        return null;
    }

    return adminIdentity;
}

function parseTimeString(timeStr) {
    if (!timeStr || typeof timeStr !== "string") return null;
    const t = timeStr.trim();
    const m = t.match(/([0-9]{1,2}):?([0-9]{0,2})\s*(AM|PM|am|pm)?/);
    if (!m) return null;
    let hh = parseInt(m[1], 10);
    let mm = m[2] ? parseInt(m[2], 10) : 0;
    const ampm = (m[3] || "").toUpperCase();
    if (Number.isNaN(hh) || Number.isNaN(mm)) return null;

    if (ampm) {
        if (hh < 1 || hh > 12 || mm < 0 || mm > 59) return null;
        return { hour: hh, minute: mm, ampm };
    }

    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
    if (hh === 0) return { hour: 12, minute: mm, ampm: "AM" };
    if (hh === 12) return { hour: 12, minute: mm, ampm: "PM" };
    if (hh > 12) return { hour: hh - 12, minute: mm, ampm: "PM" };
    return { hour: hh, minute: mm, ampm: "AM" };
}

const buildFrontendBase = (req) => {
    const env = process.env.FRONTEND_URL;
    if (env) return env.replace(/\/$/, "");
    const origin = req.get("origin") || req.get("referer") || null;
    return origin ? origin.replace(/\/$/, "") : null;
};

function resolveClerkUserId(req) {
    try {
        const auth = typeof req.auth === "function" ? req.auth() : (req.auth || {});
        const candidate = auth?.userId || auth?.user_id || auth?.user?.id || req.user?.id || null;
        if (candidate) return candidate;
        try {
            const serverAuth = getAuth ? getAuth(req) : null;
            return serverAuth?.userId || null;
        } catch (e) {
            return null;
        }
    } catch (e) {
        return null;
    }
}

function formatServiceAppointment(row, serviceInfo = null) {
    const service = serviceInfo || (row.service ? row.service : null);
    return {
        _id: row.id,
        id: row.id,
        createdBy: row.created_by,
        patientName: row.patient_name,
        patientEmail: row.patient_email || "",
        mobile: row.mobile,
        age: row.age,
        gender: row.gender,
        serviceId: service ? { _id: service.id, name: service.name } : row.service_id,
        serviceName: row.service_name || (service ? service.name : ""),
        serviceImage: row.service_image || { url: "", publicId: "" },
        fees: row.fees,
        date: row.date,
        hour: row.hour,
        minute: row.minute,
        ampm: row.ampm,
        status: row.status,
        rescheduledTo: row.rescheduled_to,
        payment: sanitizePaymentForResponse(row.payment),
        paidAt: row.paid_at || row.payment?.paidAt || null,
        flexibleScheduling: Boolean(row.payment?.meta?.flexibleScheduling),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        notes: row.notes || "",
    };
}

function isMissingColumnError(error, columnName) {
    const text = [error?.code, error?.message, error?.details, error?.hint]
        .filter(Boolean)
        .join(" ");

    return /column .* does not exist|could not find the .* column/i.test(text) &&
        text.toLowerCase().includes(String(columnName || "").toLowerCase());
}

function isScheduleNotNullConstraintError(error) {
    const text = [error?.code, error?.message, error?.details]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

    return error?.code === "23502" &&
        text.includes("service_appointments") &&
        (
            text.includes("column \"date\"") ||
            text.includes("column \"hour\"") ||
            text.includes("column \"minute\"") ||
            text.includes("column \"ampm\"")
        );
}

async function tableSupportsColumn(tableName, columnName) {
    const cacheKey = `${tableName}.${columnName}`;
    if (columnSupportCache.has(cacheKey)) {
        return columnSupportCache.get(cacheKey);
    }

    const { error } = await supabase
        .from(tableName)
        .select(columnName)
        .limit(1);

    if (!error) {
        columnSupportCache.set(cacheKey, true);
        return true;
    }

    if (isMissingColumnError(error, columnName)) {
        if (!columnWarningCache.has(cacheKey)) {
            columnWarningCache.add(cacheKey);
            console.warn(`[service-appointments] ${cacheKey} is not available yet. Run the recommended SQL if this field is required.`);
        }
    } else {
        console.warn(`[service-appointments] Unable to verify ${cacheKey}:`, error?.message || error);
    }

    return false;
}

async function withPatientEmailIfSupported(payload, emailValue) {
    const patientEmail = normalizeOptionalEmail(emailValue);
    if (!patientEmail) return payload;

    const supportsPatientEmail = await tableSupportsColumn("service_appointments", "patient_email");
    if (!supportsPatientEmail) return payload;

    return {
        ...payload,
        patient_email: patientEmail,
    };
}

function formatServiceTimeLabel({ time, hour, minute, ampm }) {
    if (time && String(time).trim()) {
        return String(time).trim();
    }

    if (hour === undefined || hour === null || minute === undefined || minute === null || !ampm) {
        return "N/A";
    }

    return `${hour}:${String(minute).padStart(2, "0")} ${ampm}`;
}

function serviceHasScheduledSlots(slots) {
    if (!slots || typeof slots !== "object") return false;

    if (Array.isArray(slots)) {
        return slots.length > 0;
    }

    return Object.values(slots).some((slotList) =>
        Array.isArray(slotList) && slotList.length > 0
    );
}

async function notifyServiceAppointmentCreatedEmails(appointment, fallbackEmail = "", explicitTimeLabel = "") {
    const patientEmail = normalizeOptionalEmail(appointment?.patient_email || fallbackEmail);
    const adminEmail = getAdminNotifyEmail();
    const paymentMethod = appointment?.payment?.method || "Online";
    const paymentStatus = String(appointment?.payment?.status || "").trim().toLowerCase();
    const commonPayload = {
        patientName: appointment?.patient_name || "",
        serviceName: appointment?.service_name || "",
        date: appointment?.date || "",
        timeLabel: explicitTimeLabel || formatServiceTimeLabel({
            hour: appointment?.hour,
            minute: appointment?.minute,
            ampm: appointment?.ampm,
        }),
        fees: appointment?.fees ?? 0,
        paymentMethod,
        status: appointment?.status || "",
        mobile: appointment?.mobile || "",
        isOnlinePending:
            paymentMethod === "Online" &&
            paymentStatus !== "paid" &&
            paymentStatus !== "confirmed" &&
            Number(appointment?.fees || 0) > 0,
    };

    if (patientEmail) {
        await sendServiceAppointmentCreatedEmail({
            to: patientEmail,
            ...commonPayload,
        });
    }

    if (adminEmail) {
        await sendServiceAppointmentCreatedEmail({
            to: adminEmail,
            ...commonPayload,
            isAdminNotification: true,
        });
    }
}

// To create a service appointment
export const createServiceAppointment = async (req, res) => {
    try {
        const body = req.body || {};
        const clerkUserId = resolveClerkUserId(req);
        if (!clerkUserId) return res.status(401).json({
            success: false,
            message: "Unauthorized: User ID not found in request",
        });

        const {
            serviceId,
            serviceName: serviceNameFromBody,
            patientName,
            mobile,
            age,
            gender,
            date,
            time,
            hour,
            minute,
            ampm,
            paymentMethod = "Online",
            amount: amountFromBody,
            fees: feesFromBody,
            email,
            flexibleScheduling = false,
            meta = {},
            notes = "",
            serviceImageUrl: serviceImageUrlFromBody,
            serviceImagePublicId: serviceImagePublicIdFromBody,
        } = body;
        const normalizedPatientEmail = normalizeOptionalEmail(email);
        const shouldLoadPatientProfile =
            !trimString(patientName) ||
            !trimString(mobile) ||
            age === undefined ||
            age === null ||
            age === "" ||
            !trimString(gender) ||
            !normalizedPatientEmail;

        const patientProfile = shouldLoadPatientProfile
            ? await fetchPatientProfileByClerkUserId(clerkUserId)
            : null;

        const resolvedPatientName = trimString(patientName) || patientProfile?.fullName || "";
        const resolvedMobile = trimString(mobile) || patientProfile?.mobile || "";
        const fallbackAge = patientProfile?.age ?? calculateAgeFromDateOfBirth(patientProfile?.dateOfBirth);
        const rawResolvedAge =
            age !== undefined && age !== null && age !== ""
                ? age
                : fallbackAge;
        const resolvedAge =
            rawResolvedAge === undefined || rawResolvedAge === null || rawResolvedAge === ""
                ? null
                : Number(rawResolvedAge);
        const resolvedGender = trimString(gender) || patientProfile?.gender || "";
        const resolvedPatientEmail = normalizeOptionalEmail(email || patientProfile?.email || "");

        if (!serviceId) return res.status(400).json({ success: false, message: "serviceId is required" });
        if (!resolvedPatientName) return res.status(400).json({ success: false, message: "patientName is required" });
        if (!resolvedMobile) return res.status(400).json({ success: false, message: "mobile is required" });

        let svc = null;
        try {
            const { data: serviceData, error: svcError } = await supabase
                .from('services')
                .select('id, name, image_url, image_public_id, slots')
                .eq('id', serviceId)
                .maybeSingle();
            if (!svcError && serviceData) svc = serviceData;
        } catch (e) { console.warn("Service lookup failed:", e?.message || e); }

        const hasScheduledSlots = serviceHasScheduledSlots(svc?.slots);
        const isFlexibleScheduling = Boolean(flexibleScheduling) || !hasScheduledSlots;
        const finalDate = date && String(date).trim() ? String(date).trim() : null;

        if (!isFlexibleScheduling && !finalDate) {
            return res.status(400).json({ success: false, message: "date is required (YYYY-MM-DD)" });
        }

        const numericAmount = safeNumber(amountFromBody ?? feesFromBody ?? 0);
        if (numericAmount === null || numericAmount < 0) return res.status(400).json({ success: false, message: "amount/fees must be a valid number" });

        if (resolvedAge !== null && (!Number.isFinite(resolvedAge) || resolvedAge < 0 || resolvedAge > 120)) {
            return res.status(400).json({ success: false, message: "age must be a reasonable number" });
        }

        let finalHour = hour !== undefined ? safeNumber(hour) : null;
        let finalMinute = minute !== undefined ? safeNumber(minute) : null;
        let finalAmpm = ampm || null;

        if (!isFlexibleScheduling && time && (finalHour === null || finalHour === undefined)) {
            const parsed = parseTimeString(time);
            if (!parsed) return res.status(400).json({ success: false, message: "time string couldn't be parsed" });
            finalHour = parsed.hour;
            finalMinute = parsed.minute;
            finalAmpm = parsed.ampm;
        }

        if (!isFlexibleScheduling && (finalHour === null || finalMinute === null || (finalAmpm !== "AM" && finalAmpm !== "PM"))) {
            return res.status(400).json({ success: false, message: "Time missing or invalid - provide time string or hour, minute and ampm." });
        }

        if (isFlexibleScheduling) {
            finalHour = null;
            finalMinute = null;
            finalAmpm = null;
        }

        // Duplicate booking check
        if (!isFlexibleScheduling) {
            try {
                const { data: existing, error: dupError } = await supabase
                    .from('service_appointments')
                    .select('id')
                    .eq('service_id', String(serviceId))
                    .eq('created_by', clerkUserId)
                    .eq('date', finalDate)
                    .eq('hour', Number(finalHour))
                    .eq('minute', Number(finalMinute))
                    .eq('ampm', finalAmpm)
                    .neq('status', 'Canceled')
                    .maybeSingle();
                if (existing) return res.status(409).json({ success: false, message: "You already have a booking for this service at the selected date and time." });
            } catch (chkErr) {
                console.warn("Duplicate booking check failed:", chkErr);
            }
        }

        let resolvedServiceName = serviceNameFromBody || (svc && (svc.name || svc.title)) || "Service";
        const svcImageUrlFromDB = svc && (String(svc.image_url || "").trim() || "");
        const svcImagePublicIdFromDB = svc && (String(svc.image_public_id || "").trim() || "");
        const finalServiceImageUrl = (svcImageUrlFromDB && svcImageUrlFromDB.length) ? svcImageUrlFromDB : ((serviceImageUrlFromBody && String(serviceImageUrlFromBody).trim()) || "");
        const finalServiceImagePublicId = (svcImagePublicIdFromDB && svcImagePublicIdFromDB.length) ? svcImagePublicIdFromDB : ((serviceImagePublicIdFromBody && String(serviceImagePublicIdFromBody).trim()) || "");

        const base = await withPatientEmailIfSupported({
            service_id: serviceId,
            service_name: resolvedServiceName,
            service_image: { url: finalServiceImageUrl, publicId: finalServiceImagePublicId },
            patient_name: resolvedPatientName,
            mobile: resolvedMobile,
            age: resolvedAge,
            gender: resolvedGender,
            date: finalDate,
            hour: finalHour === null ? null : Number(finalHour),
            minute: finalMinute === null ? null : Number(finalMinute),
            ampm: finalAmpm,
            fees: numericAmount,
            created_by: clerkUserId,
            notes: notes || "",
        }, resolvedPatientEmail);
        const timeLabel = formatServiceTimeLabel({
            time: isFlexibleScheduling ? "To be scheduled" : time,
            hour: finalHour,
            minute: finalMinute,
            ampm: finalAmpm,
        });
        const paymentMeta = { ...meta, flexibleScheduling: isFlexibleScheduling };
        const normalizedPaymentMethod = normalizePaymentMethod(paymentMethod);

        // Free appointment
        if (numericAmount === 0) {
            const paidAt = new Date().toISOString();
            const insertPayload = {
                ...base,
                status: "Pending",
                payment: buildPayment({
                    method: normalizedPaymentMethod,
                    status: "Paid",
                    amount: 0,
                    paidAt,
                    extra: {
                        meta: {
                            ...paymentMeta,
                            freeService: true,
                        },
                    },
                }),
            };
            if (await tableSupportsColumn("service_appointments", "paid_at")) {
                insertPayload.paid_at = paidAt;
            }

            const { data: created, error: insertError } = await supabase
                .from('service_appointments')
                .insert(insertPayload)
                .select()
                .single();
            if (insertError) {
                if (isFlexibleScheduling && isScheduleNotNullConstraintError(insertError)) {
                    return res.status(500).json({ success: false, message: FLEXIBLE_SCHEDULE_SCHEMA_MESSAGE });
                }
                throw insertError;
            }
            await notifyServiceAppointmentCreatedEmails(created, resolvedPatientEmail, timeLabel);
            return res.status(201).json({ success: true, appointment: formatServiceAppointment(created) });
        }

        // Cash booking
        if (normalizedPaymentMethod === "Cash") {
            const { data: created, error: insertError } = await supabase
                .from('service_appointments')
                .insert({
                    ...base,
                    status: "Pending",
                    payment: buildPayment({
                        method: "Cash",
                        status: "Pending",
                        amount: numericAmount,
                        paidAt: null,
                        confirmedBy: null,
                        extra: { meta: paymentMeta },
                    }),
                })
                .select()
                .single();
            if (insertError) {
                if (isFlexibleScheduling && isScheduleNotNullConstraintError(insertError)) {
                    return res.status(500).json({ success: false, message: FLEXIBLE_SCHEDULE_SCHEMA_MESSAGE });
                }
                throw insertError;
            }
            await notifyServiceAppointmentCreatedEmails(created, resolvedPatientEmail, timeLabel);
            return res.status(201).json({ success: true, appointment: formatServiceAppointment(created), checkoutUrl: null });
        }

        // Online booking (Stripe)
        if (!stripe) return res.status(500).json({ success: false, message: "Stripe not configured on server" });
        const frontendBase = buildFrontendBase(req);
        if (!frontendBase) return res.status(500).json({ success: false, message: "Frontend base URL not available. Set FRONTEND_URL or provide Origin header." });

        const successUrl = `${frontendBase}/service-appointment/success?session_id={CHECKOUT_SESSION_ID}`;
        const cancelUrl = `${frontendBase}/service-appointment/cancel`;

        const stripeUnitAmount = toStripeUnitAmount(numericAmount);

        let session;
        try {
            session = await stripe.checkout.sessions.create({
                payment_method_types: ["card"],
                mode: "payment",
                customer_email: resolvedPatientEmail || undefined,
                line_items: [
                    {
                        price_data: {
                            currency: STRIPE_CURRENCY,
                            product_data: {
                                name: `Service: ${String(resolvedServiceName).slice(0, 60)}`,
                                description: isFlexibleScheduling
                                    ? "Flexible scheduling - clinic will contact the patient"
                                    : `Appointment on ${base.date} ${base.hour}:${String(base.minute).padStart(2, "0")} ${base.ampm}`,
                            },
                            unit_amount: stripeUnitAmount,
                        },
                        quantity: 1,
                    },
                ],
                success_url: successUrl,
                cancel_url: cancelUrl,
                metadata: {
                    serviceId: String(serviceId),
                    serviceName: String(resolvedServiceName).slice(0, 200),
                    patientName: base.patient_name,
                    mobile: base.mobile,
                    clerkUserId: base.created_by || "",
                    serviceImageUrl: finalServiceImageUrl ? String(finalServiceImageUrl).slice(0, 200) : "",
                    flexibleScheduling: isFlexibleScheduling ? "true" : "false",
                    currency: STRIPE_CURRENCY,
                },
            });
        } catch (stripeErr) {
            console.error("Stripe create session error:", stripeErr);
            const message = stripeErr?.raw?.message || stripeErr?.message || "Stripe error";
            return res.status(502).json({ success: false, message: `Payment provider error: ${message}` });
        }

        try {
            const { data: created, error: insertError } = await supabase
                .from('service_appointments')
                .insert({
                    ...base,
                    status: "Pending",
                    payment: buildPayment({
                        method: "Online",
                        status: "Pending",
                        amount: numericAmount,
                        sessionId: session.id || "",
                        extra: {
                            currency: STRIPE_CURRENCY,
                            meta: paymentMeta,
                        },
                    }),
                })
                .select()
                .single();
            if (insertError) throw insertError;
            await notifyServiceAppointmentCreatedEmails(created, resolvedPatientEmail, timeLabel);
            return res.status(201).json({ success: true, appointment: formatServiceAppointment(created), checkoutUrl: session.url || null });
        } catch (dbErr) {
            console.error("DB error saving service appointment after stripe session:", dbErr);
            if (isFlexibleScheduling && isScheduleNotNullConstraintError(dbErr)) {
                return res.status(500).json({ success: false, message: FLEXIBLE_SCHEDULE_SCHEMA_MESSAGE });
            }
            return res.status(500).json({ success: false, message: "Failed to create appointment record" });
        }
    } catch (err) {
        console.error("createServiceAppointment unexpected:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

// To confirm the service payment
export const confirmServicePayment = async (req, res) => {
    try {
        const { session_id } = req.query;
        if (!session_id) return res.status(400).json({
            success: false,
            message: "session_id query parameter is required",
        });
        if (!stripe) return res.status(500).json({
            success: false,
            message: "Stripe not configured on server",
        });

        let session;
        try { session = await stripe.checkout.sessions.retrieve(session_id); }
        catch (err) {
            console.error("Stripe error:", err);
            return res.status(404).json({
                success: false,
                message: "Payment session not found",
            });
        }

        if (!session) return res.status(404).json({
            success: false,
            message: "Payment session not found",
        });
        if (session.payment_status !== "paid") return res.status(400).json({
            success: false,
            message: "Payment not completed",
        });

        let { data: appt, error: findError } = await supabase
            .from('service_appointments')
            .select('*')
            .eq('payment->>sessionId', session_id)
            .maybeSingle();
        if (findError) throw findError;

        if (!appt && session.metadata?.appointmentId) {
            const { data: byId, error: idError } = await supabase
                .from('service_appointments')
                .select('*')
                .eq('id', session.metadata.appointmentId)
                .maybeSingle();
            if (idError) throw idError;
            appt = byId;
        }

        if (!appt) return res.status(404).json({ success: false, message: "Service appointment not found" });
        if (isCanceledStatus(appt.status)) {
            return res.status(400).json({ success: false, message: "Cannot confirm payment for a canceled service appointment" });
        }

        const paidAt = new Date().toISOString();
        const currency = normalizeStripeCurrency(session.currency || session.metadata?.currency || STRIPE_CURRENCY);
        const currentPayment = appt.payment || {};
        const updatedPayment = buildPayment({
            method: "Online",
            status: "Paid",
            amount: fromStripeUnitAmount(session.amount_total || 0, currency),
            providerId: session.payment_intent || currentPayment.providerId || "",
            sessionId: session_id,
            paidAt,
            extra: {
                ...currentPayment,
                currency,
                meta: {
                    ...(currentPayment.meta || {}),
                    flexibleScheduling:
                        currentPayment.meta?.flexibleScheduling ??
                        (session.metadata?.flexibleScheduling === "true"),
                },
            },
        });
        const updatePayload = { payment: updatedPayment };
        if (!isTerminalAppointmentStatus(appt.status)) {
            updatePayload.status = "Confirmed";
        }
        if (await tableSupportsColumn("service_appointments", "paid_at")) {
            updatePayload.paid_at = paidAt;
        }

        const { data: updated, error: updateError } = await supabase
            .from('service_appointments')
            .update(updatePayload)
            .eq('id', appt.id)
            .select()
            .single();

        if (updateError) throw updateError;
        const formatted = formatServiceAppointment(updated);
        return res.json({ success: true, appointment: formatted, data: formatted });
    } catch (err) {
        console.error("confirmServicePayment unexpected:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

// To get service appointments (with join fixed: image_url not image_small)
export const getServiceAppointments = async (req, res) => {
    try {
        const { serviceId, mobile, status, page: pageRaw = 1, limit: limitRaw = 50, search = "" } = req.query;
        const limit = Math.min(200, Math.max(1, parseInt(limitRaw, 10) || 50));
        const page = Math.max(1, parseInt(pageRaw, 10) || 1);
        const from = (page - 1) * limit;
        const to = from + limit - 1;

        let query = supabase
            .from('service_appointments')
            .select(`
                *,
                service:service_id (
                    id,
                    name,
                    image_url
                )
            `, { count: 'exact' });

        if (serviceId) query = query.eq('service_id', serviceId);
        if (mobile) query = query.eq('mobile', mobile);
        if (status) query = query.eq('status', status);
        if (search) {
            query = query.or(`patient_name.ilike.%${search}%,mobile.ilike.%${search}%`);
        }

        const { data: appointments, count, error } = await query
            .order('created_at', { ascending: false })
            .range(from, to);

        if (error) {
            console.error("Supabase error in getServiceAppointments (with join):", error);
            // Fallback: try without join
            const { data: fallbackData, error: fallbackError } = await supabase
                .from('service_appointments')
                .select('*')
                .range(from, to)
                .order('created_at', { ascending: false });
            if (fallbackError) throw fallbackError;
            const formattedFallback = fallbackData.map(apt => formatServiceAppointment(apt, null));
            return res.json({
                success: true,
                appointments: formattedFallback,
                meta: { page, limit, total: fallbackData.length, count: formattedFallback.length }
            });
        }

        const formatted = appointments.map(apt => formatServiceAppointment(apt, apt.service));
        return res.json({
            success: true,
            appointments: formatted,
            meta: { page, limit, total: count, count: formatted.length }
        });
    } catch (err) {
        console.error("getServiceAppointments unexpected:", err);
        return res.status(500).json({ success: false, message: "Server error: " + (err.message || "Unknown error") });
    }
};

// To get service appointment by id
export const getServiceAppointmentById = async (req, res) => {
    try {
        const { id } = req.params;
        const { data: appt, error } = await supabase
            .from('service_appointments')
            .select('*')
            .eq('id', id)
            .maybeSingle();

        if (error) throw error;
        if (!appt) return res.status(404).json({
            success: false,
            message: "Service appointment not found"
        });
        return res.json({ success: true, data: formatServiceAppointment(appt) });
    } catch (err) {
        console.error("getServiceAppointmentById unexpected:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

// To update an appointment
export const updateServiceAppointment = async (req, res) => {
    try {
        const { id } = req.params;
        const body = req.body || {};

        if (hasPaymentMutation(body)) {
            return res.status(400).json({
                success: false,
                message: "Use the admin service cash payment endpoint to update payment status.",
            });
        }

        const { data: appt, error: fetchError } = await supabase
            .from('service_appointments')
            .select('*')
            .eq('id', id)
            .maybeSingle();

        if (fetchError) throw fetchError;
        if (!appt) return res.status(404).json({ success: false, message: "Service appointment not found" });

        const terminal = isTerminalAppointmentStatus(appt.status);
        if (terminal && body.status && normalizeAppointmentStatus(body.status) !== normalizeAppointmentStatus(appt.status)) {
            return res.status(400).json({ success: false, message: "Cannot change status of a completed/canceled service appointment" });
        }

        const updates = {};
        if (body.status !== undefined) updates.status = body.status;
        if (body.notes !== undefined) updates.notes = body.notes;

        if (body.rescheduledTo) {
            if (terminal) {
                return res.status(400).json({ success: false, message: "Cannot reschedule a completed/canceled service appointment" });
            }
            const { date, time } = body.rescheduledTo || {};
            updates.rescheduled_to = {};
            if (date) {
                if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ success: false, message: "rescheduledTo.date must be YYYY-MM-DD" });
                updates.rescheduled_to.date = date;
                updates.date = date;
            }
            if (time) {
                updates.rescheduled_to.time = String(time);
                const parsed = parseTimeString(String(time));
                if (!parsed) return res.status(400).json({ success: false, message: "rescheduledTo.time couldn't be parsed" });
                updates.hour = parsed.hour;
                updates.minute = parsed.minute;
                updates.ampm = parsed.ampm;
            }
            if (!body.status) updates.status = "Rescheduled";
        }

        const { data: updated, error: updateError } = await supabase
            .from('service_appointments')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (updateError) {
            if (updateError.code === 'PGRST116') {
                return res.status(404).json({ success: false, message: "Service appointment not found" });
            }
            throw updateError;
        }
        return res.json({ success: true, data: formatServiceAppointment(updated) });
    } catch (err) {
        console.error("updateServiceAppointment unexpected:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

// To cancel an appointment
export const cancelServiceAppointment = async (req, res) => {
    try {
        const { id } = req.params;
        const { data: appt, error: fetchError } = await supabase
            .from('service_appointments')
            .select('*')
            .eq('id', id)
            .single();

        if (fetchError) {
            if (fetchError.code === 'PGRST116') {
                return res.status(404).json({ success: false, message: "Not found" });
            }
            throw fetchError;
        }
        if (isCompletedStatus(appt.status)) return res.status(400).json({ success: false, message: "Cannot cancel a completed appointment" });
        if (isCanceledStatus(appt.status)) {
            return res.json({ success: true, data: formatServiceAppointment(appt), message: "Service appointment is already canceled." });
        }

        const currentPayment = appt.payment || {};
        const newPayment = {
            ...currentPayment,
            status: getPaymentStatus(currentPayment) === "Paid"
                ? "Refunded"
                : getPaymentMethod(currentPayment) === "Online"
                    ? "Failed"
                    : "Pending",
        };

        const { data: updated, error: updateError } = await supabase
            .from('service_appointments')
            .update({ status: "Canceled", payment: newPayment })
            .eq('id', id)
            .select()
            .single();

        if (updateError) throw updateError;
        return res.json({ success: true, data: formatServiceAppointment(updated) });
    } catch (err) {
        console.error("cancelServiceAppointment unexpected:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

export const updateServiceCashPaymentStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { paymentStatus, note = "" } = req.body || {};
        const requestedStatus = normalizePaymentStatus(paymentStatus);
        const adminIdentity = validateAdminRequest(req, res);

        if (!adminIdentity) return;

        if (requestedStatus !== "Paid") {
            return res.status(400).json({
                success: false,
                message: "Only marking cash service payments as Paid is supported by this endpoint.",
            });
        }

        const { data: appt, error: fetchError } = await supabase
            .from("service_appointments")
            .select("*")
            .eq("id", id)
            .maybeSingle();

        if (fetchError) throw fetchError;
        if (!appt) {
            return res.status(404).json({
                success: false,
                message: "Service appointment not found with the provided id.",
            });
        }

        const currentPayment = appt.payment || {};
        if (getPaymentMethod(currentPayment) !== "Cash") {
            return res.status(400).json({
                success: false,
                message: "Only cash service appointment payments can be manually marked as paid.",
            });
        }

        if (getPaymentStatus(currentPayment) === "Paid") {
            return res.json({
                success: true,
                message: "Cash service payment is already marked as paid.",
                appointment: formatServiceAppointment(appt),
                data: formatServiceAppointment(appt),
            });
        }

        if (isCanceledStatus(appt.status)) {
            return res.status(400).json({
                success: false,
                message: "Cannot mark payment as paid for a canceled service appointment.",
            });
        }

        const paidAt = new Date().toISOString();
        const updatedPayment = buildPayment({
            method: "Cash",
            status: "Paid",
            amount: currentPayment.amount ?? appt.fees ?? 0,
            paidAt,
            confirmedBy: adminIdentity.id,
            note: String(note || "").trim(),
            extra: currentPayment,
        });
        const updatePayload = { payment: updatedPayment };
        if (await tableSupportsColumn("service_appointments", "paid_at")) {
            updatePayload.paid_at = paidAt;
        }

        const { data: updated, error: updateError } = await supabase
            .from("service_appointments")
            .update(updatePayload)
            .eq("id", id)
            .select()
            .single();

        if (updateError) throw updateError;

        try {
            const patientEmail = normalizeOptionalEmail(updated.patient_email || "");
            if (patientEmail) {
                await sendServiceCashPaymentConfirmedEmail({
                    to: patientEmail,
                    patientName: updated.patient_name || "",
                    serviceName: updated.service_name || "",
                    date: updated.date || "",
                    timeLabel: formatServiceTimeLabel({
                        hour: updated.hour,
                        minute: updated.minute,
                        ampm: updated.ampm,
                    }),
                    amount: updatedPayment.amount,
                    paidAt,
                    note: updatedPayment.note || "",
                });
            }
        } catch (emailError) {
            console.warn("Service cash payment confirmation email failed:", emailError?.message || emailError);
        }

        const formatted = formatServiceAppointment(updated);
        return res.json({
            success: true,
            message: "Cash service payment marked as paid.",
            appointment: formatted,
            data: formatted,
        });
    } catch (err) {
        console.error("updateServiceCashPaymentStatus unexpected:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

// To get the statistics of service appointments
export const getServiceAppointmentStats = async (req, res) => {
    try {
        const { data: services, error: svcError } = await supabase
            .from('services')
            .select('id, name, price, image_url, created_at');

        if (svcError) throw svcError;
        if (!services || services.length === 0) {
            return res.json({ success: true, services: [], totalServices: 0 });
        }

        const serviceIds = services.map(s => s.id);
        const { data: appointments, error: aptError } = await supabase
            .from('service_appointments')
            .select('service_id, status, fees, payment')
            .in('service_id', serviceIds);

        if (aptError) throw aptError;

        const statsMap = {};
        appointments.forEach(apt => {
            if (!statsMap[apt.service_id]) {
                statsMap[apt.service_id] = { total: 0, completed: 0, canceled: 0, paidRevenue: 0 };
            }
            statsMap[apt.service_id].total++;
            if (apt.status === "Completed") statsMap[apt.service_id].completed++;
            else if (apt.status === "Canceled") statsMap[apt.service_id].canceled++;
            if (getPaymentStatus(apt.payment || {}) === "Paid") {
                statsMap[apt.service_id].paidRevenue += Number(apt.payment?.amount ?? apt.fees ?? 0) || 0;
            }
        });

        const result = services.map(s => {
            const stats = statsMap[s.id] || { total: 0, completed: 0, canceled: 0, paidRevenue: 0 };
            return {
                id: s.id,
                name: s.name,
                price: s.price,
                image: s.image_url,
                totalAppointments: stats.total,
                completed: stats.completed,
                canceled: stats.canceled,
                earning: stats.paidRevenue,
                createdAt: s.created_at,
            };
        });

        result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        return res.json({
            success: true,
            services: result,
            totalServices: result.length
        });
    } catch (err) {
        console.error("getServiceAppointmentStats unexpected:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

// To get appointment for the patient
export const getServiceAppointmentsByPatient = async (req, res) => {
    try {
        const clerkUserId = resolveClerkUserId(req);
        const { createdBy, mobile } = req.query;
        const resolvedCreatedBy = createdBy || clerkUserId || null;

        if (!resolvedCreatedBy && !mobile) return res.json({
            success: true,
            data: []
        });

        let query = supabase.from('service_appointments').select('*');
        if (resolvedCreatedBy) query = query.eq('created_by', resolvedCreatedBy);
        if (mobile) query = query.eq('mobile', mobile);

        const { data: list, error } = await query.order('created_at', { ascending: false });
        if (error) throw error;

        const formatted = list.map(item => formatServiceAppointment(item));
        return res.json({
            success: true,
            data: formatted
        });
    } catch (err) {
        console.error("getServiceAppointmentsByPatient unexpected:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

export default {
    createServiceAppointment,
    confirmServicePayment,
    getServiceAppointments,
    getServiceAppointmentById,
    updateServiceAppointment,
    updateServiceCashPaymentStatus,
    cancelServiceAppointment,
    getServiceAppointmentStats,
    getServiceAppointmentsByPatient
};
