import nodemailer from "nodemailer";

const EMAIL_WARNING_PREFIX = "[email]";
const warnedMessages = new Set();

let cachedTransporter = null;
let cachedTransporterSignature = "";

const warnOnce = (key, message) => {
    if (warnedMessages.has(key)) return;
    warnedMessages.add(key);
    console.warn(`${EMAIL_WARNING_PREFIX} ${message}`);
};

const toBoolean = (value) => String(value || "").trim().toLowerCase() === "true";

const parsePort = (value) => {
    const port = Number.parseInt(String(value || "").trim(), 10);
    return Number.isFinite(port) ? port : null;
};

const getEmailConfig = () => {
    const host = String(process.env.SMTP_HOST || "").trim();
    const port = parsePort(process.env.SMTP_PORT);
    const secure = toBoolean(process.env.SMTP_SECURE);
    const user = String(process.env.SMTP_USER || "").trim();
    const pass = String(process.env.SMTP_PASS || "");
    const from = String(process.env.EMAIL_FROM || "Healthcare Appointment System <no-reply@example.com>").trim();

    return { host, port, secure, user, pass, from };
};

export const isEmailEnabled = () => {
    const { host, port, user, pass, from } = getEmailConfig();
    return Boolean(host && port && user && pass && from);
};

const getTransporter = () => {
    const config = getEmailConfig();

    if (!config.host || !config.port || !config.user || !config.pass || !config.from) {
        warnOnce(
            "email-config-missing",
            "SMTP configuration is incomplete. Email sending will be skipped until SMTP_* and EMAIL_FROM are configured."
        );
        return null;
    }

    const signature = JSON.stringify({
        host: config.host,
        port: config.port,
        secure: config.secure,
        user: config.user,
        from: config.from,
    });

    if (cachedTransporter && cachedTransporterSignature === signature) {
        return cachedTransporter;
    }

    try {
        cachedTransporter = nodemailer.createTransport({
            host: config.host,
            port: config.port,
            secure: config.secure,
            auth: {
                user: config.user,
                pass: config.pass,
            },
        });
        cachedTransporterSignature = signature;
        return cachedTransporter;
    } catch (error) {
        warnOnce(
            `email-transporter-${error?.message || "unknown"}`,
            `Unable to initialize the SMTP transporter. Email sending will be skipped.`
        );
        return null;
    }
};

const normalizeRecipients = (value) => {
    if (Array.isArray(value)) {
        return value.map((entry) => String(entry || "").trim()).filter(Boolean);
    }

    const single = String(value || "").trim();
    return single ? [single] : [];
};

const escapeHtml = (value) =>
    String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

const formatMoney = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return "N/A";
    return `$${numeric.toFixed(2)}`;
};

const buildHtmlTable = (details = []) => {
    const rows = details
        .filter(([, value]) => value !== undefined && value !== null && value !== "")
        .map(
            ([label, value]) => `
                <tr>
                    <td style="padding:8px 12px;border:1px solid #dbe7e4;background:#f7fbfa;font-weight:600;">${escapeHtml(label)}</td>
                    <td style="padding:8px 12px;border:1px solid #dbe7e4;">${escapeHtml(value)}</td>
                </tr>
            `
        )
        .join("");

    if (!rows) {
        return `<p style="margin:0 0 16px;">No additional details were provided.</p>`;
    }

    return `
        <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;color:#1f2937;">
            ${rows}
        </table>
    `;
};

const buildTextTable = (details = []) =>
    details
        .filter(([, value]) => value !== undefined && value !== null && value !== "")
        .map(([label, value]) => `${label}: ${value}`)
        .join("\n");

const renderEmailHtml = ({ title, intro, details, closing }) => `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:680px;margin:0 auto;padding:24px;color:#1f2937;line-height:1.5;">
        <h2 style="margin:0 0 16px;color:#0f766e;">${escapeHtml(title)}</h2>
        <p style="margin:0 0 16px;">${escapeHtml(intro)}</p>
        ${buildHtmlTable(details)}
        ${closing ? `<p style="margin:16px 0 0;">${escapeHtml(closing)}</p>` : ""}
        <hr style="border:none;border-top:1px solid #dbe7e4;margin:24px 0 12px;" />
        <p style="margin:0;font-size:12px;color:#6b7280;">This is an automated message from Healthcare Appointment System.</p>
    </div>
`;

const renderEmailText = ({ title, intro, details, closing }) => {
    const parts = [
        title,
        "",
        intro,
    ];

    const detailsText = buildTextTable(details);
    if (detailsText) {
        parts.push("", detailsText);
    }

    if (closing) {
        parts.push("", closing);
    }

    parts.push("", "This is an automated message from Healthcare Appointment System.");
    return parts.join("\n");
};

const resolveAppointmentStatusSubject = (status, isAdminNotification) => {
    const normalized = String(status || "").trim();

    if (normalized === "Canceled" || normalized === "Cancelled") {
        return isAdminNotification ? "Doctor Appointment Cancelled" : "Doctor Appointment Cancelled";
    }
    if (normalized === "Rescheduled") {
        return isAdminNotification ? "Doctor Appointment Rescheduled" : "Doctor Appointment Rescheduled";
    }

    return isAdminNotification ? "Doctor Appointment Status Updated" : "Doctor Appointment Status Updated";
};

export async function sendEmail({ to, subject, html, text }) {
    const recipients = normalizeRecipients(to);
    if (recipients.length === 0) {
        return {
            success: false,
            skipped: true,
            reason: "Recipient missing",
        };
    }

    const transporter = getTransporter();
    if (!transporter || !isEmailEnabled()) {
        return {
            success: false,
            skipped: true,
            reason: "Email not configured",
        };
    }

    const { from } = getEmailConfig();

    try {
        await transporter.sendMail({
            from,
            to: recipients.join(", "),
            subject: String(subject || "Healthcare Notification"),
            html: html || "<p>This is an automated message from Healthcare Appointment System.</p>",
            text: text || "This is an automated message from Healthcare Appointment System.",
        });

        return {
            success: true,
            skipped: false,
        };
    } catch (error) {
        console.warn(`${EMAIL_WARNING_PREFIX} Failed to send email: ${error?.message || "Unknown error"}`);
        return {
            success: false,
            skipped: false,
            reason: error?.message || "Email send failed",
        };
    }
}

export async function sendAppointmentCreatedEmail({
    to,
    patientName,
    doctorName,
    speciality,
    date,
    time,
    fees,
    paymentMethod,
    status,
    mobile,
    isOnlinePending = false,
    isAdminNotification = false,
}) {
    const title = isAdminNotification
        ? "New Doctor Appointment Booking"
        : isOnlinePending
            ? "Doctor Appointment Request Created"
            : "Doctor Appointment Confirmation";

    const intro = isAdminNotification
        ? "A new doctor appointment booking has been created."
        : isOnlinePending
            ? "Your appointment request was created. Please complete online payment to confirm it."
            : "Your doctor appointment has been created successfully.";

    const details = [
        ["Patient Name", patientName],
        ["Doctor", doctorName],
        ["Speciality", speciality],
        ["Date", date],
        ["Time", time],
        ["Fees", formatMoney(fees)],
        ["Payment Method", paymentMethod],
        ["Status", status],
        ["Mobile", isAdminNotification ? mobile : null],
    ];

    const closing = isAdminNotification
        ? "Please review the new booking in the clinic dashboard."
        : "If you need to make changes, please contact the clinic or use the appointments section in the app.";

    return sendEmail({
        to,
        subject: title,
        html: renderEmailHtml({ title, intro, details, closing }),
        text: renderEmailText({ title, intro, details, closing }),
    });
}

export async function sendAppointmentStatusEmail({
    to,
    patientName,
    doctorName,
    speciality,
    date,
    time,
    previousStatus,
    newStatus,
    rescheduledDate,
    rescheduledTime,
    mobile,
    isAdminNotification = false,
}) {
    const title = resolveAppointmentStatusSubject(newStatus, isAdminNotification);
    const intro = isAdminNotification
        ? `A doctor appointment status was updated to ${newStatus || "Unknown"}.`
        : `Your doctor appointment status was updated to ${newStatus || "Unknown"}.`;

    const details = [
        ["Patient Name", patientName],
        ["Doctor", doctorName],
        ["Speciality", speciality],
        ["Previous Status", previousStatus],
        ["New Status", newStatus],
        ["Date", date],
        ["Time", time],
        ["Rescheduled Date", rescheduledDate],
        ["Rescheduled Time", rescheduledTime],
        ["Mobile", isAdminNotification ? mobile : null],
    ];

    const closing = isAdminNotification
        ? "Please review the updated appointment in the clinic dashboard."
        : "If you have questions about this change, please contact the clinic.";

    return sendEmail({
        to,
        subject: title,
        html: renderEmailHtml({ title, intro, details, closing }),
        text: renderEmailText({ title, intro, details, closing }),
    });
}

export async function sendCashPaymentConfirmedEmail({
    to,
    patientName,
    doctorName,
    speciality,
    date,
    time,
    amount,
    paidAt,
    note,
}) {
    const title = "Cash Payment Confirmed";
    const intro = "Your cash payment for this doctor appointment has been confirmed by the clinic.";
    const paidAtLabel = paidAt ? new Date(paidAt).toLocaleString("en-US") : "";
    const details = [
        ["Patient Name", patientName],
        ["Doctor", doctorName],
        ["Speciality", speciality],
        ["Date", date],
        ["Time", time],
        ["Payment Method", "Cash"],
        ["Payment Status", "Paid"],
        ["Amount", formatMoney(amount)],
        ["Paid At", paidAtLabel],
        ["Note", note],
    ];
    const closing = "Thank you. Please keep this message as your payment confirmation.";

    return sendEmail({
        to,
        subject: title,
        html: renderEmailHtml({ title, intro, details, closing }),
        text: renderEmailText({ title, intro, details, closing }),
    });
}

export async function sendServiceCashPaymentConfirmedEmail({
    to,
    patientName,
    serviceName,
    date,
    timeLabel,
    amount,
    paidAt,
    note,
}) {
    const title = "Service Cash Payment Confirmed";
    const intro = "Your cash payment for this service appointment has been confirmed by the clinic.";
    const paidAtLabel = paidAt ? new Date(paidAt).toLocaleString("en-US") : "";
    const details = [
        ["Patient Name", patientName],
        ["Service", serviceName],
        ["Date", date],
        ["Time", timeLabel],
        ["Payment Method", "Cash"],
        ["Payment Status", "Paid"],
        ["Amount", formatMoney(amount)],
        ["Paid At", paidAtLabel],
        ["Note", note],
    ];
    const closing = "Thank you. Please keep this message as your payment confirmation.";

    return sendEmail({
        to,
        subject: title,
        html: renderEmailHtml({ title, intro, details, closing }),
        text: renderEmailText({ title, intro, details, closing }),
    });
}

export async function sendServiceAppointmentCreatedEmail({
    to,
    patientName,
    serviceName,
    date,
    timeLabel,
    fees,
    paymentMethod,
    status,
    mobile,
    isOnlinePending = false,
    isAdminNotification = false,
}) {
    const title = isAdminNotification
        ? "New Service Appointment Booking"
        : isOnlinePending
            ? "Service Appointment Request Created"
            : "Service Appointment Confirmation";

    const intro = isAdminNotification
        ? "A new service appointment booking has been created."
        : isOnlinePending
            ? "Your service appointment request was created. Please complete online payment to confirm it."
            : "Your service appointment has been created successfully.";

    const details = [
        ["Patient Name", patientName],
        ["Service", serviceName],
        ["Date", date],
        ["Time", timeLabel],
        ["Fees", formatMoney(fees)],
        ["Payment Method", paymentMethod],
        ["Status", status],
        ["Mobile", isAdminNotification ? mobile : null],
    ];

    const closing = isAdminNotification
        ? "Please review the new service appointment in the clinic dashboard."
        : "If you need help with this appointment, please contact the clinic.";

    return sendEmail({
        to,
        subject: title,
        html: renderEmailHtml({ title, intro, details, closing }),
        text: renderEmailText({ title, intro, details, closing }),
    });
}

export async function sendContactNotificationEmail({
    to,
    name,
    email,
    phone,
    subjectLine,
    message,
    createdAt,
}) {
    const title = "New Contact Message";
    const intro = "A new contact form message was submitted through the Healthcare Appointment System.";
    const details = [
        ["Name", name],
        ["Email", email],
        ["Phone", phone],
        ["Subject", subjectLine],
        ["Message", message],
        ["Received At", createdAt],
    ];
    const closing = "Please review and follow up with the sender if needed.";

    return sendEmail({
        to,
        subject: title,
        html: renderEmailHtml({ title, intro, details, closing }),
        text: renderEmailText({ title, intro, details, closing }),
    });
}
