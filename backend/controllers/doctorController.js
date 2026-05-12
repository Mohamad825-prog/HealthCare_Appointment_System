import { supabase } from '../config/supabase.js';
import { uploadToCloudinary, deleteFromCloudinary } from "../utils/cloudinary.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const BCRYPT_SALT_ROUNDS = 10;
const BCRYPT_HASH_REGEX = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

// Helper function to handle doctor creation and updating

function omitDoctorPassword(raw = {}) {
    const doctor = { ...raw };
    delete doctor.password;
    return doctor;
}

async function hashDoctorPassword(password) {
    return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
}

function isBcryptHash(password = "") {
    return typeof password === "string" && BCRYPT_HASH_REGEX.test(password);
}

async function verifyAndUpgradeDoctorPassword(doctor, password) {
    if (!doctor?.password || typeof doctor.password !== "string") {
        return false;
    }

    if (isBcryptHash(doctor.password)) {
        return bcrypt.compare(password, doctor.password);
    }

    if (doctor.password !== password) {
        return false;
    }

    try {
        const hashedPassword = await hashDoctorPassword(password);
        const { error } = await supabase
            .from('doctors')
            .update({ password: hashedPassword })
            .eq('id', doctor.id);

        if (error) {
            console.error("Doctor password migration error:", error);
        } else {
            doctor.password = hashedPassword;
        }
    } catch (error) {
        console.error("Doctor password migration error:", error);
    }

    return true;
}

// This function will convert time to number of minutes since midnight;
const parseTimeToMinutes = (t = "") => {
    const [time = "0:00", ampm = ""] = (t || "").split(" ");
    const [hh = 0, mm = 0] = time.split(":").map(Number);
    let h = hh % 12;
    if ((ampm || "").toUpperCase() === "PM") h += 12;
    return h * 60 + (mm || 0);
};

// This function will deduplicate and sort the schedule slots for each date
function dedupeAndSortSchedule(schedule = {}) {
    const out = {};
    Object.entries(schedule).forEach(([date, slots]) => {
        if (!Array.isArray(slots)) return;
        const uniq = Array.from(new Set(slots));
        uniq.sort((a, b) => parseTimeToMinutes(a) - parseTimeToMinutes(b));
        out[date] = uniq;
    });
    return out;
}

// This function will parse the schedule input from the client, which can be a JSON string or an object, and then deduplicate and sort the slots for each date
function parseScheduleInput(s) {
    if (!s) return {};
    if (typeof s === "string") {
        try {
            s = JSON.parse(s);
        } catch {
            return {};
        }
    }
    return dedupeAndSortSchedule(s || {});
}

// This function will normalize the doctor document before sending it to the client, ensuring that the schedule is a plain object, and setting default values for availability, patients, rating, and fee if they are missing
function normalizeDocForClient(raw = {}) {
    const doc = omitDoctorPassword(raw);

    // ensure schedule is a plain object (Supabase returns JSONB as object already)
    if (!doc.schedule || typeof doc.schedule !== "object") {
        doc.schedule = {};
    }

    doc.availability = doc.availability === undefined ? "Available" : doc.availability;
    doc.patients = doc.patients ?? "";
    doc.rating = doc.rating ?? 0;
    doc.fee = doc.fee ?? doc.fees ?? 0;

    return doc;
}

// To create a Doctor
export async function createDoctor(req, res) {
    try {
        const body = req.body || {};
        if (!body.email || !body.password || !body.name) {
            return res.status(400).json({
                success: false,
                message: "Name, email and password are required"
            });
        }

        const emailLC = (body.email || "").toLowerCase();

        // Check if doctor already exists
        const { data: existingDoctor, error: findError } = await supabase
            .from('doctors')
            .select('id')
            .eq('email', emailLC)
            .maybeSingle();

        if (existingDoctor) {
            return res.status(409).json({
                success: false,
                message: "A doctor with this email already exists"
            });
        }
        if (findError && findError.code !== 'PGRST116') { // PGRST116 = no rows returned
            console.error("Error checking existing doctor:", findError);
            return res.status(500).json({ success: false, message: "Database error" });
        }

        let imageUrl = body.imageUrl || null;
        let imagePublicId = body.imagePublicId || null;
        if (req.file?.path) {
            const uploaded = await uploadToCloudinary(req.file.path, "doctors");
            imageUrl = uploaded?.secure_url || uploaded?.url || imageUrl;
            imagePublicId = uploaded?.public_id || uploaded?.publicId || imagePublicId;
        }

        const schedule = parseScheduleInput(body.schedule);
        const hashedPassword = await hashDoctorPassword(body.password);

        // Insert new doctor
        const { data: newDoctor, error: insertError } = await supabase
            .from('doctors')
            .insert({
                email: emailLC,
                password: hashedPassword,
                name: body.name,
                specialization: body.specialization || "",
                image_url: imageUrl,
                image_public_id: imagePublicId,
                availability: body.availability || "Available",
                experience: body.experience || "",
                qualifications: body.qualifications || "",
                location: body.location || "",
                about: body.about || "",
                fee: body.fee !== undefined ? Number(body.fee) : 0,
                schedule: schedule, // JSONB
                success: body.success || "",
                patients: body.patients || "",
                rating: body.rating !== undefined ? Number(body.rating) : 0,
            })
            .select()
            .single();

        if (insertError) {
            console.error("Insert doctor error:", insertError);
            return res.status(500).json({ success: false, message: "Failed to create doctor" });
        }

        const secret = process.env.JWT_SECRET;
        if (!secret) {
            console.warn("JWT_SECRET is not set in environment variables");
            return res.status(500).json({ success: false, message: "Server configuration error" });
        }

        const token = jwt.sign({
            id: newDoctor.id,
            email: newDoctor.email,
            role: "doctor"
        }, secret, { expiresIn: "7d" });

        const out = normalizeDocForClient(newDoctor);

        return res.status(201).json({
            success: true,
            data: out,
            token
        });
    } catch (err) {
        console.error("Create doctor error:", err);
        return res.status(500).json({
            success: false,
            message: "An error occurred while creating the doctor"
        });
    }
}

// To get Doctors
export const getDoctors = async (req, res) => {
    try {
        const { q = "", limit: limitRaw = 200, page: pageRaw = 1 } = req.query;
        const limit = Math.min(500, Math.max(1, parseInt(limitRaw, 10) || 200));
        const page = Math.max(1, parseInt(pageRaw, 10) || 1);
        const from = (page - 1) * limit;
        const to = from + limit - 1;

        let query = supabase.from('doctors').select('*', { count: 'exact' });

        if (q && typeof q === "string" && q.trim()) {
            const searchTerm = q.trim();
            // Use OR condition on name, specialization, email
            query = query.or(`name.ilike.%${searchTerm}%,specialization.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`);
        }

        const { data: doctors, count, error } = await query.range(from, to).order('name', { ascending: true });

        if (error) {
            console.error("Get doctors error:", error);
            return res.status(500).json({ success: false, message: "Database error" });
        }

        if (!doctors || doctors.length === 0) {
            return res.json({ success: true, data: [], doctors: [], meta: { page, limit, total: 0 } });
        }

        // Fetch appointment counts per doctor
        const doctorIds = doctors.map(d => d.id);
        const { data: appointments, error: aptErr } = await supabase
            .from('appointments')
            .select('doctor_id, status, fees, payment')
            .in('doctor_id', doctorIds);

        if (aptErr) {
            console.error("Error fetching appointments for stats:", aptErr);
            // Continue without stats
        }

        const stats = {};
        if (appointments) {
            appointments.forEach(apt => {
                if (!stats[apt.doctor_id]) {
                    stats[apt.doctor_id] = { total: 0, completed: 0, canceled: 0, earnings: 0 };
                }
                stats[apt.doctor_id].total++;
                if (apt.status === "Confirmed" || apt.status === "Completed") {
                    stats[apt.doctor_id].completed++;
                } else if (apt.status === "Canceled") {
                    stats[apt.doctor_id].canceled++;
                }

                if (apt.payment?.status === "Paid") {
                    stats[apt.doctor_id].earnings += (apt.fees || 0);
                }
            });
        }

        const normalized = doctors.map(d => ({
            _id: d.id,
            id: d.id,
            name: d.name || "",
            specialization: d.specialization || "",
            fee: d.fee ?? 0,
            imageUrl: d.image_url || null,
            appointmentsTotal: stats[d.id]?.total || 0,
            appointmentsCompleted: stats[d.id]?.completed || 0,
            appointmentsCanceled: stats[d.id]?.canceled || 0,
            earnings: stats[d.id]?.earnings || 0,
            availability: d.availability ?? "Available",
            schedule: d.schedule || {},
            patients: d.patients ?? "",
            rating: d.rating ?? 0,
            about: d.about ?? "",
            experience: d.experience ?? "",
            qualifications: d.qualifications ?? "",
            location: d.location ?? "",
            success: d.success ?? "",
            raw: omitDoctorPassword(d),
        }));

        return res.json({
            success: true,
            data: normalized,
            doctors: normalized,
            meta: { page, limit, total: count || 0 }
        });
    } catch (err) {
        console.error("getDoctors:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

// To get a Doctor by ID
export async function getDoctorById(req, res) {
    try {
        const { id } = req.params;
        const { data: doctor, error } = await supabase
            .from('doctors')
            .select('*')
            .eq('id', id)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return res.status(404).json({ success: false, message: "Doctor not found" });
            }
            throw error;
        }

        return res.json({ success: true, data: normalizeDocForClient(doctor) });
    } catch (err) {
        console.error("Get doctor by ID error:", err);
        return res.status(500).json({ success: false, message: "An error occurred while fetching the doctor" });
    }
}

// To update a Doctor
export async function updateDoctor(req, res) {
    try {
        const { id } = req.params;
        const body = req.body || {};

        if (!req.doctor || String(req.doctor.id) !== String(id)) {
            return res.status(403).json({ success: false, message: "Not authorized to update this doctor" });
        }

        // Fetch existing doctor to check existence and for image deletion
        const { data: existing, error: fetchError } = await supabase
            .from('doctors')
            .select('*')
            .eq('id', id)
            .single();

        if (fetchError) {
            if (fetchError.code === 'PGRST116') {
                return res.status(404).json({ success: false, message: "Doctor not found" });
            }
            throw fetchError;
        }

        const updates = {};

        // If a new image is uploaded, upload it to Cloudinary and update the doctor's imageUrl and imagePublicId. If there was a previous image, delete it from Cloudinary.
        if (req.file?.path) {
            const uploaded = await uploadToCloudinary(req.file.path, "doctors");
            if (uploaded) {
                const previousPublicId = existing.image_public_id;
                updates.image_url = uploaded.secure_url || uploaded.url;
                updates.image_public_id = uploaded.public_id || uploaded.publicId;
                if (previousPublicId && previousPublicId !== updates.image_public_id) {
                    deleteFromCloudinary(previousPublicId).catch((e) => console.warn("deleteFromCloudinary warning:", e?.message || e));
                }
            }
        } else if (body.imageUrl) {
            updates.image_url = body.imageUrl;
        }

        if (body.schedule) updates.schedule = parseScheduleInput(body.schedule);

        const updatable = ["name", "specialization", "experience", "qualifications", "location", "about", "fee", "availability", "success", "patients", "rating"];
        updatable.forEach((k) => {
            if (body[k] !== undefined) updates[k] = body[k];
        });

        if (body.email && body.email !== existing.email) {
            // Check if new email already in use
            const { data: other, error: otherError } = await supabase
                .from('doctors')
                .select('id')
                .eq('email', body.email.toLowerCase())
                .maybeSingle();
            if (other && other.id !== id) {
                return res.status(409).json({ success: false, message: "Email already in use" });
            }
            updates.email = body.email.toLowerCase();
        }

        if (body.password) {
            updates.password = await hashDoctorPassword(body.password);
        }

        const { data: updatedDoctor, error: updateError } = await supabase
            .from('doctors')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (updateError) {
            console.error("Update doctor error:", updateError);
            return res.status(500).json({ success: false, message: "Failed to update doctor" });
        }

        const out = normalizeDocForClient(updatedDoctor);
        return res.json({ success: true, data: out });
    } catch (err) {
        console.error("updateDoctor error:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
}

// To delete a Doctor
export async function deleteDoctor(req, res) {
    try {
        const { id } = req.params;

        // Fetch existing to get image public id for deletion
        const { data: existing, error: fetchError } = await supabase
            .from('doctors')
            .select('image_public_id')
            .eq('id', id)
            .single();

        if (fetchError) {
            if (fetchError.code === 'PGRST116') {
                return res.status(404).json({ success: false, message: "Doctor not found" });
            }
            throw fetchError;
        }

        if (existing.image_public_id) {
            try {
                await deleteFromCloudinary(existing.image_public_id);
            } catch (e) {
                console.warn("DeleteFromCloudinary warning:", e?.message || e);
            }
        }

        const { error: deleteError } = await supabase
            .from('doctors')
            .delete()
            .eq('id', id);

        if (deleteError) {
            console.error("Delete doctor error:", deleteError);
            return res.status(500).json({ success: false, message: "Failed to delete doctor" });
        }

        return res.json({ success: true, message: "Doctor deleted successfully" });
    } catch (err) {
        console.error("Delete doctor error:", err);
        return res.status(500).json({ success: false, message: "An error occurred while deleting the doctor" });
    }
}

// To toggle Doctor availability
export async function toggleAvailability(req, res) {
    try {
        const { id } = req.params;

        if (!req.doctor || String(req.doctor.id) !== String(id)) {
            return res.status(403).json({ success: false, message: "Not authorized to update this doctor availability" });
        }

        // Fetch current availability
        const { data: doctor, error: fetchError } = await supabase
            .from('doctors')
            .select('availability')
            .eq('id', id)
            .single();

        if (fetchError) {
            if (fetchError.code === 'PGRST116') {
                return res.status(404).json({ success: false, message: "Doctor not found" });
            }
            throw fetchError;
        }

        let newAvailability;
        if (typeof doctor.availability === "boolean") {
            newAvailability = !doctor.availability;
        } else {
            newAvailability = doctor.availability === "Available" ? "Unavailable" : "Available";
        }

        const { data: updated, error: updateError } = await supabase
            .from('doctors')
            .update({ availability: newAvailability })
            .eq('id', id)
            .select()
            .single();

        if (updateError) {
            console.error("Toggle availability error:", updateError);
            return res.status(500).json({ success: false, message: "Failed to update availability" });
        }

        const out = normalizeDocForClient(updated);
        return res.json({ success: true, data: out });
    } catch (err) {
        console.error("Toggle availability error:", err);
        return res.status(500).json({ success: false, message: "An error occurred while toggling the doctor's availability" });
    }
}

// To login the doctor
export async function doctorLogin(req, res) {
    try {
        const { email, password } = req.body || {};
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required"
            });
        }

        const { data: doctor, error } = await supabase
            .from('doctors')
            .select('*')
            .eq('email', email.toLowerCase())
            .single();

        if (error || !doctor) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password"
            });
        }

        const isPasswordValid = await verifyAndUpgradeDoctorPassword(doctor, password);
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password"
            });
        }

        const secret = process.env.JWT_SECRET;
        if (!secret) {
            return res.status(500).json({
                success: false,
                message: "Server configuration error"
            });
        }

        const token = jwt.sign({
            id: doctor.id,
            email: doctor.email,
            role: "doctor"
        }, secret, { expiresIn: "7d" });

        const out = omitDoctorPassword(doctor);
        return res.json({ success: true, token, data: out });
    } catch (err) {
        console.error("Doctor login error:", err);
        return res.status(500).json({ success: false, message: "An error occurred while logging in" });
    }
}
