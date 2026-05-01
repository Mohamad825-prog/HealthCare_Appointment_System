import express from "express";
import { clerkMiddleware, requireAuth } from "@clerk/express";
import { confirmPayment, getAppointments, getStats } from "../controllers/appointmentController.js";
import {
    createAppointment,
    getAppointmentsByPatient,
    getAppointmentsByDoctor,
    getAppointmentsForAuthenticatedDoctor,
    cancelAppointment,
    cancelDoctorAppointment,
    getRegisteredUserCount,
    updateAppointment,
    updateDoctorAppointment,
} from "../controllers/appointmentController.js";
import doctorAuth from "../middlewares/doctorAuth.js";

const appointmentRouter = express.Router();

appointmentRouter.get("/", getAppointments);
appointmentRouter.get("/confirm", confirmPayment);
appointmentRouter.get("/stats/summary", getStats);

// authentic routes
appointmentRouter.post('/', clerkMiddleware(), requireAuth(), createAppointment);
appointmentRouter.get('/me', clerkMiddleware(), requireAuth(), getAppointmentsByPatient);

appointmentRouter.get("/doctor/me", doctorAuth, getAppointmentsForAuthenticatedDoctor);
appointmentRouter.get("/doctor/:doctorId", getAppointmentsByDoctor);
appointmentRouter.put("/doctor/:id", doctorAuth, updateDoctorAppointment);
appointmentRouter.post("/doctor/:id/cancel", doctorAuth, cancelDoctorAppointment);

appointmentRouter.post("/:id/cancel", cancelAppointment);
appointmentRouter.get("/patients/count", getRegisteredUserCount);
appointmentRouter.put("/:id", updateAppointment);

export default appointmentRouter;
