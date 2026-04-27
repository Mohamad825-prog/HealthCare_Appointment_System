import Stripe from "stripe";
import { getAuth } from "@clerk/express";
import { clerkClient } from "@clerk/clerk-sdk-node";
import { supabase } from "../config/supabase.js";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
console.log("Stripe key loaded?", Boolean(process.env.STRIPE_SECRET_KEY));
const FRONTEND_URL = process.env.FRONTEND_URL;
const MAJOR_ADMIN_ID = process.env.MAJOR_ADMIN_ID || null;
const stripe = STRIPE_SECRET_KEY
    ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" })
    : null;

// Helpers
// Safely parse a value to a number, returning null if it's not a valid number
const safeNumber = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};

// Build the base URL for frontend links, using environment variable or request headers
const buildFrontendBase = (req) => {
    if (FRONTEND_URL) return FRONTEND_URL.replace(/\/$/, "");
    const origin = req.get("origin") || req.get("referer");
    if (origin) return origin.replace(/\/$/, "");
    const host = req.get("host");
    if (host) return `${req.protocol || "http"}://${host}`.replace(/\/$/, "");
    return null;
};

// Resolve the user ID from the request, checking various properties and Clerk auth
function resolveClerkUserId(req) {
    try {
        const auth = typeof req.auth === "function" ? req.auth() : (req.auth || {});
        const fromReq = auth?.userId || auth?.user_id || auth?.user?.id || req.user?.id || null;
        if (fromReq) return fromReq;
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

// Helper to convert a Supabase appointment row to the same object format as before
function formatAppointment(row, doctorInfo = null) {
    const doctor = doctorInfo || (row.doctor ? row.doctor : null);
    return {
        _id: row.id,
        id: row.id,
        owner: row.owner,
        createdBy: row.created_by,
        patientName: row.patient_name,
        mobile: row.mobile,
        age: row.age,
        gender: row.gender,
        doctorId: doctor ? { _id: doctor.id, name: doctor.name, speciality: doctor.specialization } : row.doctor_id,
        doctorName: row.doctor_name || (doctor ? doctor.name : ""),
        speciality: row.speciality || (doctor ? doctor.specialization : ""),
        doctorImage: row.doctor_image || { url: "", publicId: "" },
        date: row.date,
        time: row.time,
        fees: row.fees,
        status: row.status,
        rescheduledTo: row.rescheduled_to,
        payment: row.payment,
        sessionId: row.session_id,
        paidAt: row.paid_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        notes: row.notes || "",
    };
}

// To getAppointments (admin)
export const getAppointments = async (req, res) => {
    try {
        const { doctorId, mobile, status, search = "", limit: limitRaw = 50, page: pageRaw = 1, patientClerkId, createdBy } = req.query;
        const limit = Math.min(200, Math.max(1, parseInt(limitRaw, 10) || 50));
        const page = Math.max(1, parseInt(pageRaw, 10) || 1);
        const from = (page - 1) * limit;
        const to = from + limit - 1;

        let query = supabase.from('appointments').select(`
            *,
            doctor:doctor_id ( id, name, specialization )
        `, { count: 'exact' });

        // Apply filters
        if (doctorId) query = query.eq('doctor_id', doctorId);
        if (mobile) query = query.eq('mobile', mobile);
        if (status) query = query.eq('status', status);
        if (patientClerkId) query = query.eq('created_by', patientClerkId);
        if (createdBy) query = query.eq('created_by', createdBy);
        if (search) {
            query = query.or(`patient_name.ilike.%${search}%,mobile.ilike.%${search}%`);
        }

        const { data: appointments, count, error } = await query
            .order('created_at', { ascending: false })
            .range(from, to);

        if (error) throw error;

        const formatted = appointments.map(apt => formatAppointment(apt, apt.doctor));
        return res.json({
            success: true,
            appointments: formatted,
            meta: { page, limit, total: count, count: formatted.length }
        });
    } catch (err) {
        console.error("Get Appointments Error:", err);
        return res.status(500).json({
            success: false,
            message: "An error occurred while fetching appointments."
        });
    }
};

// To getAppointments by patient
export const getAppointmentsByPatient = async (req, res) => {
    try {
        const queryCreatedBy = req.query.createdBy || null;
        const clerkUserId = resolveClerkUserId(req);
        const resolvedCreatedBy = queryCreatedBy || clerkUserId || null;

        if (!resolvedCreatedBy && !req.query.mobile) {
            return res.json({
                success: true,
                appointments: [],
                data: []
            });
        }

        let query = supabase.from('appointments').select(`
            *,
            doctor:doctor_id ( id, name, specialization )
        `);

        if (resolvedCreatedBy) query = query.eq('created_by', resolvedCreatedBy);
        if (req.query.mobile) query = query.eq('mobile', req.query.mobile);

        const { data: appointments, error } = await query.order('date', { ascending: true }).order('time', { ascending: true });

        if (error) throw error;

        const formatted = appointments.map(apt => formatAppointment(apt, apt.doctor));
        return res.json({ success: true, appointments: formatted, data: formatted });
    } catch (err) {
        console.error("Get Appointments By Patient Error:", err);
        return res.status(500).json({
            success: false,
            message: "An error occurred while fetching appointments by patient."
        });
    }
};

// To create an appointment
export const createAppointment = async (req, res) => {
    try {
        const {
            doctorId,
            patientName,
            mobile,
            age = "",
            gender = "",
            date,
            time,
            fee,
            fees,
            notes = "",
            email,
            paymentMethod,
            owner: ownerFromBody = null,
            doctorName: doctorNameFromBody,
            speciality: specialityFromBody,
            doctorImageUrl: doctorImageUrlFromBody,
            doctorImagePublicId: doctorImagePublicIdFromBody,
        } = req.body || {};

        const clerkUserId = resolveClerkUserId(req);
        if (!clerkUserId) return res.status(401).json({
            success: false,
            message: "Unauthorized: Unable to resolve user identity."
        });

        if (!doctorId || !patientName || !mobile || !date || !time) {
            return res.status(400).json({
                success: false,
                message: "Missing required fields: doctorId, patientName, mobile, date, and time are required."
            });
        }

        const numericFee = safeNumber(fee ?? fees ?? 0);
        if (numericFee === null || numericFee < 0) {
            return res.status(400).json({
                success: false,
                message: "Invalid fee: Fee must be a non-negative number."
            });
        }

        // Duplicate booking prevention
        const { data: existingBooking, error: dupError } = await supabase
            .from('appointments')
            .select('id')
            .eq('doctor_id', doctorId)
            .eq('created_by', clerkUserId)
            .eq('date', String(date))
            .eq('time', String(time))
            .neq('status', 'Canceled')
            .maybeSingle();

        if (existingBooking) {
            return res.status(409).json({
                success: false,
                message: "You already have an appointment booked with this doctor at the same date and time."
            });
        }

        // Fetch doctor details
        let doctor = null;
        const { data: doctorData, error: doctorError } = await supabase
            .from('doctors')
            .select('id, name, specialization, image_url, image_public_id, fee')
            .eq('id', doctorId)
            .maybeSingle();

        if (doctorError) console.warn("Doctor Lookup Failed:", doctorError?.message);
        doctor = doctorData;

        if (!doctor) return res.status(404).json({
            success: false,
            message: "Doctor not found with the provided doctorId."
        });

        // Resolve owner, names, images, etc.
        let resolvedOwner = ownerFromBody || null;
        if (!resolvedOwner) resolvedOwner = MAJOR_ADMIN_ID || String(doctorId);

        const doctorName = (doctor.name && String(doctor.name).trim()) || (doctorNameFromBody && String(doctorNameFromBody).trim()) || "";
        const speciality = (doctor.specialization && String(doctor.specialization).trim()) || (specialityFromBody && String(specialityFromBody).trim()) || "";

        const doctorImageUrl = (doctor.image_url && String(doctor.image_url).trim()) || (doctorImageUrlFromBody && String(doctorImageUrlFromBody).trim()) || "";
        const doctorImagePublicId = (doctor.image_public_id && String(doctor.image_public_id).trim()) || (doctorImagePublicIdFromBody && String(doctorImagePublicIdFromBody).trim()) || "";
        const doctorImage = { url: doctorImageUrl, publicId: doctorImagePublicId };

        const base = {
            doctor_id: String(doctorId),
            doctor_name: doctorName,
            speciality: speciality,
            doctor_image: doctorImage,
            patient_name: String(patientName).trim(),
            mobile: String(mobile).trim(),
            age: age ? Number(age) : null,
            gender: gender ? String(gender) : "",
            date: String(date),
            time: String(time),
            fees: numericFee,
            status: "Pending",
            payment: { method: paymentMethod === "Cash" ? "Cash" : "Online", status: "Pending", amount: numericFee },
            created_by: clerkUserId,
            owner: resolvedOwner,
            session_id: null,
        };

        // Free appointment
        if (numericFee === 0) {
            const { data: created, error: insertError } = await supabase
                .from('appointments')
                .insert({
                    ...base,
                    status: "Confirmed",
                    payment: { method: base.payment.method, status: "Paid", amount: 0 },
                    paid_at: new Date().toISOString(),
                })
                .select()
                .single();

            if (insertError) throw insertError;
            return res.status(201).json({ success: true, appointment: formatAppointment(created), checkoutUrl: null });
        }

        // Cash payment
        if (paymentMethod === "Cash") {
            const { data: created, error: insertError } = await supabase
                .from('appointments')
                .insert(base)
                .select()
                .single();

            if (insertError) throw insertError;
            return res.status(201).json({ success: true, appointment: formatAppointment(created), checkoutUrl: null });
        }

        // Online: Stripe
        if (!stripe) return res.status(500).json({ success: false, message: "Stripe not configured on server" });

        const frontBase = buildFrontendBase(req);
        if (!frontBase) {
            return res.status(500).json({ success: false, message: "Frontend URL could not be determined. Set FRONTEND_URL or send Origin header." });
        }

        const successUrl = `${frontBase}/appointment/success?session_id={CHECKOUT_SESSION_ID}`;
        const cancelUrl = `${frontBase}/appointment/cancel`;

        let session;
        try {
            session = await stripe.checkout.sessions.create({
                payment_method_types: ["card"],
                mode: "payment",
                customer_email: email || undefined,
                line_items: [
                    {
                        price_data: {
                            currency: "inr",
                            product_data: { name: `Appointment - ${String(patientName).slice(0, 40)}` },
                            unit_amount: Math.round(numericFee * 100),
                        },
                        quantity: 1,
                    },
                ],
                success_url: successUrl,
                cancel_url: cancelUrl,
                metadata: {
                    doctorId: String(doctorId),
                    doctorName: doctorName || "",
                    speciality: speciality || "",
                    patientName: base.patient_name,
                    mobile: base.mobile,
                    clerkUserId: clerkUserId || "",
                },
            });
        } catch (stripeErr) {
            console.error("Stripe create session error:", stripeErr);
            const message = stripeErr?.raw?.message || stripeErr?.message || "Stripe error";
            return res.status(502).json({ success: false, message: `Payment provider error: ${message}` });
        }

        try {
            const { data: created, error: insertError } = await supabase
                .from('appointments')
                .insert({
                    ...base,
                    session_id: session.id,
                    payment: { ...base.payment, providerId: session.payment_intent || session.paymentIntent || null },
                    status: "Pending",
                })
                .select()
                .single();

            if (insertError) throw insertError;
            return res.status(201).json({ success: true, appointment: formatAppointment(created), checkoutUrl: session.url || null });
        } catch (dbErr) {
            console.error("DB error saving appointment after stripe session:", dbErr);
            return res.status(500).json({ success: false, message: "Failed to create appointment record" });
        }
    } catch (err) {
        console.error("createAppointment unexpected:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

// To confirm the online payment and make it paid
export const confirmPayment = async (req, res) => {
    try {
        const { session_id } = req.query;
        if (!session_id) return res.status(400).json({
            success: false,
            message: "Missing session_id in query parameters."
        });

        if (!stripe) return res.status(500).json({
            success: false,
            message: "Stripe not configured on server."
        });

        let session;
        try {
            session = await stripe.checkout.sessions.retrieve(session_id);
        } catch (err) {
            console.error("Stripe retrieve session error:", err);
            return res.status(404).json({
                success: false,
                message: "Payment session not found."
            });
        }

        if (!session) return res.status(404).json({
            success: false,
            message: "Payment session not found."
        });

        if (session.payment_status !== "paid") {
            return res.status(400).json({
                success: false,
                message: "Payment not completed for this session."
            });
        }

        // Try match by sessionId first
        let { data: appt, error: updateError } = await supabase
            .from('appointments')
            .update({
                payment: { method: "Online", status: "Paid", amount: Math.round((session.amount_total || 0) / 100), providerId: session.payment_intent || null },
                status: "Confirmed",
                paid_at: new Date().toISOString(),
            })
            .eq('session_id', session_id)
            .select()
            .single();

        // fallback: try match via metadata (doctorId + mobile + patientName)
        if (!appt) {
            const meta = session.metadata || {};
            if (meta.doctorId && meta.mobile && meta.patientName) {
                const { data: fallbackAppt, error: fallbackError } = await supabase
                    .from('appointments')
                    .update({
                        payment: { method: "Online", status: "Paid", amount: Math.round((session.amount_total || 0) / 100), providerId: session.payment_intent || null },
                        status: "Confirmed",
                        paid_at: new Date().toISOString(),
                        session_id: session_id,
                    })
                    .eq('doctor_id', meta.doctorId)
                    .eq('mobile', meta.mobile)
                    .eq('patient_name', meta.patientName)
                    .eq('fees', Math.round((session.amount_total || 0) / 100))
                    .select()
                    .maybeSingle();
                appt = fallbackAppt;
            }
        }

        // last attempt: find appointment created in last 15 minutes with matching amount
        if (!appt) {
            const amount = Math.round((session.amount_total || 0) / 100);
            const fifteenAgo = new Date(Date.now() - 1000 * 60 * 15).toISOString();
            const { data: recentAppt, error: recentError } = await supabase
                .from('appointments')
                .update({
                    payment: { method: "Online", status: "Paid", amount: amount, providerId: session.payment_intent || null },
                    status: "Confirmed",
                    paid_at: new Date().toISOString(),
                    session_id: session_id,
                })
                .eq('fees', amount)
                .gte('created_at', fifteenAgo)
                .select()
                .maybeSingle();
            appt = recentAppt;
        }

        if (!appt) {
            return res.status(404).json({ success: false, message: "Appointment not found for this payment session" });
        }

        return res.json({ success: true, appointment: formatAppointment(appt) });
    } catch (err) {
        console.error("confirmPayment unexpected:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

// To update an appointment
export const updateAppointment = async (req, res) => {
    try {
        const { id } = req.params;
        const body = req.body || {};

        // Fetch current appointment
        const { data: appt, error: fetchError } = await supabase
            .from('appointments')
            .select('*')
            .eq('id', id)
            .single();

        if (fetchError) {
            if (fetchError.code === 'PGRST116') {
                return res.status(404).json({ success: false, message: "Appointment not found with the provided id." });
            }
            throw fetchError;
        }

        const terminal = appt.status === "Completed" || appt.status === "Canceled";
        if (terminal && body.status && body.status !== appt.status) {
            return res.status(400).json({ success: false, message: "Cannot change status of a completed/canceled appointment" });
        }

        const updates = {};
        if (body.status) updates.status = body.status;

        if (body.date && body.time) {
            if (appt.status === "Completed" || appt.status === "Canceled") {
                return res.status(400).json({ success: false, message: "Cannot reschedule completed/canceled appointment" });
            }
            updates.date = body.date;
            updates.time = body.time;
            updates.status = "Rescheduled";
            updates.rescheduled_to = { date: body.date, time: body.time };
        }

        const { data: updated, error: updateError } = await supabase
            .from('appointments')
            .update(updates)
            .eq('id', id)
            .select(`
                *,
                doctor:doctor_id ( id, name, specialization, image_url )
            `)
            .single();

        if (updateError) throw updateError;

        return res.json({ success: true, appointment: formatAppointment(updated, updated.doctor) });
    } catch (err) {
        console.error("updateAppointment unexpected:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

// To cancel an appointment
export const cancelAppointment = async (req, res) => {
    try {
        const { id } = req.params;

        const { data: appt, error: fetchError } = await supabase
            .from('appointments')
            .select('*')
            .eq('id', id)
            .single();

        if (fetchError) {
            if (fetchError.code === 'PGRST116') {
                return res.status(404).json({ success: false, message: "Appointment not found with the provided id." });
            }
            throw fetchError;
        }

        const { data: updated, error: updateError } = await supabase
            .from('appointments')
            .update({ status: "Canceled" })
            .eq('id', id)
            .select()
            .single();

        if (updateError) throw updateError;

        return res.json({ success: true, appointment: formatAppointment(updated) });
    } catch (err) {
        console.error("cancelAppointment unexpected:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

// To get Stats
export const getStats = async (req, res) => {
    try {
        // Total appointments count
        const { count: total, error: totalError } = await supabase
            .from('appointments')
            .select('*', { count: 'exact', head: true });

        if (totalError) throw totalError;

        // Sum of fees where payment.status = 'Paid'
        const { data: paidData, error: paidError } = await supabase
            .from('appointments')
            .select('fees')
            .eq('payment->>status', 'Paid');

        if (paidError) throw paidError;
        const revenue = paidData.reduce((sum, row) => sum + (row.fees || 0), 0);

        // Count appointments in last 7 days
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const { count: recent, error: recentError } = await supabase
            .from('appointments')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', sevenDaysAgo.toISOString());

        if (recentError) throw recentError;

        return res.json({
            success: true,
            stats: { total, revenue, recentLast7Days: recent }
        });
    } catch (err) {
        console.error("getStats unexpected:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

// To get Appointment by Doctor
export const getAppointmentsByDoctor = async (req, res) => {
    try {
        const { doctorId } = req.params;
        if (!doctorId) return res.status(400).json({
            success: false,
            message: "Missing doctorId in request parameters."
        });

        const { mobile, status, search = "", limit: limitRaw = 50, page: pageRaw = 1 } = req.query;
        const limit = Math.min(200, Math.max(1, parseInt(limitRaw, 10) || 50));
        const page = Math.max(1, parseInt(pageRaw, 10) || 1);
        const from = (page - 1) * limit;
        const to = from + limit - 1;

        let query = supabase.from('appointments').select(`
            *,
            doctor:doctor_id ( id, name, specialization, image_url, image )
        `, { count: 'exact' }).eq('doctor_id', doctorId);

        if (mobile) query = query.eq('mobile', mobile);
        if (status) query = query.eq('status', status);
        if (search) {
            query = query.or(`patient_name.ilike.%${search}%,mobile.ilike.%${search}%`);
        }

        const { data: appointments, count, error } = await query
            .order('date', { ascending: true })
            .order('time', { ascending: true })
            .range(from, to);

        if (error) throw error;

        const formatted = appointments.map(apt => formatAppointment(apt, apt.doctor));
        return res.json({
            success: true,
            appointments: formatted,
            meta: { page, limit, total: count, count: formatted.length }
        });
    } catch (err) {
        console.error("getAppointmentsByDoctor unexpected:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

// To get Registered user count (via Clerk)
export async function getRegisteredUserCount(req, res) {
    try {
        const totalUsers = await clerkClient.users.getCount();
        return res.json({ success: true, totalUsers });
    } catch (err) {
        console.error("getRegisteredUserCount unexpected:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
}

export default {
    getAppointments,
    getAppointmentsByPatient,
    createAppointment,
    confirmPayment,
    updateAppointment,
    cancelAppointment,
    getStats,
    getAppointmentsByDoctor,
    getRegisteredUserCount
};
