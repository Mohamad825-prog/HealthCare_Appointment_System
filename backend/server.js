import express from 'express'; 
import cors from 'cors';

import { clerkMiddleware } from '@clerk/express';
import { backendEnvPath } from './config/env.js';
import { supabase, supabaseHost } from './config/supabase.js';
import doctorRouter from './routes/doctorRouter.js';
import serviceRouter from './routes/serviceRouter.js';
import appointmentRouter from './routes/appointmentRouter.js';
import serviceAppointmentRouter from './routes/serviceAppointmentRouter.js';
import contactRouter from './routes/contactRouter.js';
import aiRouter from './routes/aiRouter.js';
import patientProfileRoutes from './routes/patientProfileRoutes.js';
import adminRouter from './routes/adminRouter.js';
import serviceTestResultRouter from './routes/serviceTestResultRoutes.js';

const app = express();
const port = 4000;

const allowedOrigins = [
    "http://localhost:5173",
    "http://localhost:5174",
];

// Middleware
app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Admin-Id"]
}));
app.use(clerkMiddleware());
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ limit: "20mb", extended: true }));

// Test Supabase connection
async function testSupabase() {
    try {
        const { error } = await supabase.from('doctors').select('id').limit(1);

        if (error) {
            const details = error.details ? ` ${error.details}` : "";
            console.error(`Supabase connection error for ${supabaseHost}: ${error.message}${details}`);
            console.error(`Verify SUPABASE_URL in ${backendEnvPath} and check your local DNS/VPN/firewall if the host is correct.`);
            return;
        }

        console.log(`Supabase connected successfully (${supabaseHost})`);
    } catch (error) {
        const causeCode = error?.cause?.code || error?.code || "";
        if (causeCode === "ENOTFOUND") {
            console.error(`Supabase DNS lookup failed for ${supabaseHost}. Verify SUPABASE_URL in ${backendEnvPath} and check your internet/DNS/VPN settings.`);
        }
        console.error("Supabase startup check failed:", error);
    }
}
testSupabase();

// Routes
app.use("/api/doctors", doctorRouter);
app.use("/api/services", serviceRouter);
app.use("/api/appointments", appointmentRouter);
app.use("/api/service-appointments", serviceAppointmentRouter);
app.use("/api", serviceTestResultRouter);
app.use("/api/contact", contactRouter);
app.use("/api/patient/profile", patientProfileRoutes);
app.use("/api/ai", aiRouter);
app.use("/api/admin", adminRouter);

app.get('/', (req, res) => {
    res.send("API Working");
});

app.listen(port, () => {
    console.log(`Server Started on http://localhost:${port}`);
});
