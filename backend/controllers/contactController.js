import { supabase } from "../config/supabase.js";
import { sendContactNotificationEmail } from "../utils/email.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const trimString = (value) => {
    if (value == null) return "";
    return String(value).trim();
};

const normalizeOptionalString = (value) => {
    const trimmed = trimString(value);
    return trimmed || null;
};

const normalizeOptionalEmail = (value) => {
    const trimmed = trimString(value).toLowerCase();
    return EMAIL_REGEX.test(trimmed) ? trimmed : "";
};

export const createContactMessage = async (req, res) => {
    try {
        const body = req.body || {};

        const name = trimString(body.name);
        const email = trimString(body.email).toLowerCase();
        const phone = normalizeOptionalString(body.phone ?? body.mobile);
        const subject = normalizeOptionalString(body.subject);
        const message = trimString(body.message);

        if (!name || !email || !message) {
            return res.status(400).json({
                success: false,
                message: "Name, email, and message are required.",
            });
        }

        if (!EMAIL_REGEX.test(email)) {
            return res.status(400).json({
                success: false,
                message: "Please provide a valid email address.",
            });
        }

        if (name.length < 2 || name.length > 80) {
            return res.status(400).json({
                success: false,
                message: "Name must be between 2 and 80 characters.",
            });
        }

        if (phone && phone.length > 20) {
            return res.status(400).json({
                success: false,
                message: "Phone number must be 20 characters or fewer.",
            });
        }

        if (subject && subject.length > 120) {
            return res.status(400).json({
                success: false,
                message: "Subject must be 120 characters or fewer.",
            });
        }

        if (message.length < 20 || message.length > 2000) {
            return res.status(400).json({
                success: false,
                message: "Message must be between 20 and 2000 characters.",
            });
        }

        const payload = {
            name,
            email,
            phone,
            subject,
            message,
            status: "New",
            is_read: false,
        };

        const { data, error } = await supabase
            .from("contact_messages")
            .insert(payload)
            .select("id, name, email, phone, subject, message, status, is_read, created_at, updated_at")
            .single();

        if (error) {
            console.error("Create contact message error:", error);
            return res.status(500).json({
                success: false,
                message: "Failed to save your message. Please try again later.",
            });
        }

        const adminEmail = normalizeOptionalEmail(process.env.ADMIN_NOTIFY_EMAIL);
        if (adminEmail) {
            await sendContactNotificationEmail({
                to: adminEmail,
                name: data?.name || name,
                email: data?.email || email,
                phone: data?.phone || phone || "",
                subjectLine: data?.subject || subject || "",
                message: data?.message || message,
                createdAt: data?.created_at || new Date().toISOString(),
            });
        }

        return res.status(201).json({
            success: true,
            message: "Your message has been sent successfully.",
            data,
        });
    } catch (error) {
        console.error("createContactMessage unexpected:", error);
        return res.status(500).json({
            success: false,
            message: "Server error. Please try again later.",
        });
    }
};

export default {
    createContactMessage,
};
