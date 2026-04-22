import jwt from 'jsonwebtoken';
import { supabase } from '../config/supabase.js';

const JWT_SECRET = process.env.JWT_SECRET;

export default async function doctorAuth(req, res, next) {
    const authHeader = req.headers.authorization;

    // Check token
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
            success: false,
            message: "No token provided, authorization denied"
        });
    }

    const token = authHeader.split(" ")[1];

    try {
        // Verify token
        const payload = jwt.verify(token, JWT_SECRET);

        if (payload.role && payload.role !== "doctor") {
            return res.status(403).json({
                success: false,
                message: "Access denied: Not a doctor"
            });
        }

        // Fetch doctor from Supabase
        const { data: doctor, error } = await supabase
            .from('doctors')
            .select('id, email, name, specialization, image_url, availability, fee, schedule, about, experience, qualifications, location, success, patients, rating, created_at, updated_at')
            .eq('id', payload.id)
            .single();

        if (error || !doctor) {
            return res.status(401).json({
                success: false,
                message: "Doctor not found, authorization denied"
            });
        }

        // Attach doctor to request (convert snake_case to camelCase to match original expected shape)
        req.doctor = {
            id: doctor.id,
            email: doctor.email,
            name: doctor.name,
            specialization: doctor.specialization,
            imageUrl: doctor.image_url,
            availability: doctor.availability,
            fee: doctor.fee,
            schedule: doctor.schedule,
            about: doctor.about,
            experience: doctor.experience,
            qualifications: doctor.qualifications,
            location: doctor.location,
            success: doctor.success,
            patients: doctor.patients,
            rating: doctor.rating,
            createdAt: doctor.created_at,
            updatedAt: doctor.updated_at,
            _id: doctor.id,  // for compatibility with existing code that might expect _id
        };
        next();
    } catch (err) {
        console.error("Doctor JWT verification error:", err);
        return res.status(401).json({
            success: false,
            message: "Invalid token, authorization denied"
        });
    }
}