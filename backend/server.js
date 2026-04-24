import express from 'express'; 
import cors from 'cors';
import 'dotenv/config';
console.log("ENV FRONTEND_URL:", process.env.FRONTEND_URL);

import { clerkMiddleware } from '@clerk/express';
import { supabase } from './config/supabase.js';  // <-- import supabase client
import doctorRouter from './routes/doctorRouter.js';
import serviceRouter from './routes/serviceRouter.js';
import appointmentRouter from './routes/appointmentRouter.js';
import serviceAppointmentRouter from './routes/serviceAppointmentRouter.js';

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
    allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(clerkMiddleware());
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ limit: "20mb", extended: true }));

// Test Supabase connection
async function testSupabase() {
    const { error } = await supabase.from('doctors').select('id').limit(1);
    if (error) {
        console.error("Supabase connection error:", error.message);
    } else {
        console.log("Supabase connected successfully");
    }
}
testSupabase();

// Routes
app.use("/api/doctors", doctorRouter);
app.use("/api/services", serviceRouter);
app.use("/api/appointments", appointmentRouter);
app.use("/api/service-appointments", serviceAppointmentRouter);

app.get('/', (req, res) => {
    res.send("API Working");
});

app.listen(port, () => {
    console.log(`Server Started on http://localhost:${port}`);
});