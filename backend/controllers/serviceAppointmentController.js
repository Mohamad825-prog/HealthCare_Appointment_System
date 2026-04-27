import Stripe from "stripe";
import { getAuth } from "@clerk/express";
import { supabase } from "../config/supabase.js";

const stripeKey = process.env.STRIPE_SECRET_KEY || null;
const stripe = stripeKey ? new Stripe(stripeKey, { apiVersion: "2022-11-15" }) : null;

// Helper functions
const safeNumber = (val) => {
    if (val === undefined || val === null || val === "") return null;
    const n = Number(val);
    return Number.isFinite(n) ? n : null;
};

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
        payment: row.payment,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        notes: row.notes || "",
    };
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
            meta = {},
            notes = "",
            serviceImageUrl: serviceImageUrlFromBody,
            serviceImagePublicId: serviceImagePublicIdFromBody,
        } = body;

        if (!serviceId) return res.status(400).json({ success: false, message: "serviceId is required" });
        if (!patientName || !String(patientName).trim()) return res.status(400).json({ success: false, message: "patientName is required" });
        if (!mobile || !String(mobile).trim()) return res.status(400).json({ success: false, message: "mobile is required" });
        if (!date || !String(date).trim()) return res.status(400).json({ success: false, message: "date is required (YYYY-MM-DD)" });

        const numericAmount = safeNumber(amountFromBody ?? feesFromBody ?? 0);
        if (numericAmount === null || numericAmount < 0) return res.status(400).json({ success: false, message: "amount/fees must be a valid number" });

        let finalHour = hour !== undefined ? safeNumber(hour) : null;
        let finalMinute = minute !== undefined ? safeNumber(minute) : null;
        let finalAmpm = ampm || null;

        if (time && (finalHour === null || finalHour === undefined)) {
            const parsed = parseTimeString(time);
            if (!parsed) return res.status(400).json({ success: false, message: "time string couldn't be parsed" });
            finalHour = parsed.hour;
            finalMinute = parsed.minute;
            finalAmpm = parsed.ampm;
        }

        if (finalHour === null || finalMinute === null || (finalAmpm !== "AM" && finalAmpm !== "PM")) {
            return res.status(400).json({ success: false, message: "Time missing or invalid — provide time string or hour, minute and ampm." });
        }

        // Duplicate booking check
        try {
            const { data: existing, error: dupError } = await supabase
                .from('service_appointments')
                .select('id')
                .eq('service_id', String(serviceId))
                .eq('created_by', clerkUserId)
                .eq('date', String(date))
                .eq('hour', Number(finalHour))
                .eq('minute', Number(finalMinute))
                .eq('ampm', finalAmpm)
                .neq('status', 'Canceled')
                .maybeSingle();
            if (existing) return res.status(409).json({ success: false, message: "You already have a booking for this service at the selected date and time." });
        } catch (chkErr) {
            console.warn("Duplicate booking check failed:", chkErr);
        }

        // Fetch service snapshot
        let svc = null;
        try {
            const { data: serviceData, error: svcError } = await supabase
                .from('services')
                .select('id, name, image_url, image_public_id')
                .eq('id', serviceId)
                .maybeSingle();
            if (!svcError && serviceData) svc = serviceData;
        } catch (e) { console.warn("Service lookup failed:", e?.message || e); }

        let resolvedServiceName = serviceNameFromBody || (svc && (svc.name || svc.title)) || "Service";
        const svcImageUrlFromDB = svc && (String(svc.image_url || "").trim() || "");
        const svcImagePublicIdFromDB = svc && (String(svc.image_public_id || "").trim() || "");
        const finalServiceImageUrl = (svcImageUrlFromDB && svcImageUrlFromDB.length) ? svcImageUrlFromDB : ((serviceImageUrlFromBody && String(serviceImageUrlFromBody).trim()) || "");
        const finalServiceImagePublicId = (svcImagePublicIdFromDB && svcImagePublicIdFromDB.length) ? svcImagePublicIdFromDB : ((serviceImagePublicIdFromBody && String(serviceImagePublicIdFromBody).trim()) || "");

        const base = {
            service_id: serviceId,
            service_name: resolvedServiceName,
            service_image: { url: finalServiceImageUrl, publicId: finalServiceImagePublicId },
            patient_name: String(patientName).trim(),
            mobile: String(mobile).trim(),
            age: age ? Number(age) : undefined,
            gender: gender || "",
            date: String(date),
            hour: Number(finalHour),
            minute: Number(finalMinute),
            ampm: finalAmpm,
            fees: numericAmount,
            created_by: clerkUserId,
            notes: notes || "",
        };

        // Free appointment
        if (numericAmount === 0) {
            const { data: created, error: insertError } = await supabase
                .from('service_appointments')
                .insert({
                    ...base,
                    status: "Pending",
                    payment: { method: "Cash", status: "Pending", amount: 0, paidAt: new Date().toISOString() }
                })
                .select()
                .single();
            if (insertError) throw insertError;
            return res.status(201).json({ success: true, appointment: formatServiceAppointment(created) });
        }

        // Cash booking
        if (paymentMethod === "Cash") {
            const { data: created, error: insertError } = await supabase
                .from('service_appointments')
                .insert({
                    ...base,
                    status: "Pending",
                    payment: { method: "Cash", status: "Pending", amount: numericAmount, meta }
                })
                .select()
                .single();
            if (insertError) throw insertError;
            return res.status(201).json({ success: true, appointment: formatServiceAppointment(created), checkoutUrl: null });
        }

        // Online booking (Stripe)
        if (!stripe) return res.status(500).json({ success: false, message: "Stripe not configured on server" });
        const frontendBase = buildFrontendBase(req);
        if (!frontendBase) return res.status(500).json({ success: false, message: "Frontend base URL not available. Set FRONTEND_URL or provide Origin header." });

        const successUrl = `${frontendBase}/service-appointment/success?session_id={CHECKOUT_SESSION_ID}`;
        const cancelUrl = `${frontendBase}/service-appointment/cancel`;

        let session;
        try {
            session = await stripe.checkout.sessions.create({
                payment_method_types: ["card"],
                mode: "payment",
                customer_email: email ? String(email) : undefined,
                line_items: [
                    {
                        price_data: {
                            currency: "inr",
                            product_data: {
                                name: `Service: ${String(resolvedServiceName).slice(0, 60)}`,
                                description: `Appointment on ${base.date} ${base.hour}:${String(base.minute).padStart(2, "0")} ${base.ampm}`,
                            },
                            unit_amount: Math.round(numericAmount * 100),
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
                    status: "Confirmed",
                    payment: { method: "Online", status: "Pending", amount: numericAmount, sessionId: session.id || "" },
                })
                .select()
                .single();
            if (insertError) throw insertError;
            return res.status(201).json({ success: true, appointment: formatServiceAppointment(created), checkoutUrl: session.url || null });
        } catch (dbErr) {
            console.error("DB error saving service appointment after stripe session:", dbErr);
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

        let { data: appt, error: updateError } = await supabase
            .from('service_appointments')
            .update({
                payment: {
                    method: "Online",
                    status: "Confirmed",
                    amount: Math.round((session.amount_total || 0) / 100),
                    providerId: session.payment_intent || "",
                    sessionId: session_id,
                    paidAt: new Date().toISOString(),
                },
                status: "Confirmed",
            })
            .eq('payment->>sessionId', session_id)
            .select()
            .maybeSingle();

        if (!appt && session.metadata?.appointmentId) {
            const { data: byId, error: idError } = await supabase
                .from('service_appointments')
                .update({
                    payment: {
                        method: "Online",
                        status: "Confirmed",
                        amount: Math.round((session.amount_total || 0) / 100),
                        providerId: session.payment_intent || "",
                        sessionId: session_id,
                        paidAt: new Date().toISOString(),
                    },
                    status: "Confirmed",
                })
                .eq('id', session.metadata.appointmentId)
                .select()
                .maybeSingle();
            appt = byId;
        }

        if (!appt) return res.status(404).json({ success: false, message: "Service appointment not found" });
        return res.json({ success: true, appointment: formatServiceAppointment(appt) });
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

// Helper to get current payment field (used in update)
async function getPaymentField(id) {
    const { data, error } = await supabase
        .from('service_appointments')
        .select('payment')
        .eq('id', id)
        .single();
    if (error || !data) return {};
    return data.payment || {};
}

// To update an appointment
export const updateServiceAppointment = async (req, res) => {
    try {
        const { id } = req.params;
        const body = req.body || {};
        const updates = {};

        if (body.status !== undefined) updates.status = body.status;
        if (body.notes !== undefined) updates.notes = body.notes;
        if (body.payment !== undefined) updates.payment = body.payment;
        if (body["payment.status"] !== undefined) {
            const currentPayment = await getPaymentField(id);
            updates.payment = { ...currentPayment, status: body["payment.status"] };
        }

        if (body.rescheduledTo) {
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

        if (updates.payment) {
            const method = updates.payment.method || updates.payment?.method;
            if (method && String(method).toLowerCase() === "online") updates.status = updates.status || "Confirmed";
            if (updates.payment.status && updates.payment.status === "Confirmed") {
                updates.status = "Confirmed";
                if (updates.payment.paidAt === undefined) updates.payment.paidAt = new Date().toISOString();
            }
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
        if (appt.status === "Completed") return res.status(400).json({ success: false, message: "Cannot cancel a completed appointment" });

        const newPayment = { ...appt.payment };
        newPayment.status = newPayment.status === "Paid" ? "Refunded" : "Canceled";

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
            .select('service_id, status')
            .in('service_id', serviceIds);

        if (aptError) throw aptError;

        const statsMap = {};
        appointments.forEach(apt => {
            if (!statsMap[apt.service_id]) {
                statsMap[apt.service_id] = { total: 0, completed: 0, canceled: 0 };
            }
            statsMap[apt.service_id].total++;
            if (apt.status === "Completed") statsMap[apt.service_id].completed++;
            else if (apt.status === "Canceled") statsMap[apt.service_id].canceled++;
        });

        const result = services.map(s => {
            const stats = statsMap[s.id] || { total: 0, completed: 0, canceled: 0 };
            return {
                id: s.id,
                name: s.name,
                price: s.price,
                image: s.image_url,
                totalAppointments: stats.total,
                completed: stats.completed,
                canceled: stats.canceled,
                earning: stats.completed * (s.price || 0),
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
    cancelServiceAppointment,
    getServiceAppointmentStats,
    getServiceAppointmentsByPatient
};
