import express from "express";
import { clerkMiddleware, requireAuth } from "@clerk/express";
import {
    getMyPatientProfile,
    upsertMyPatientProfile,
} from "../controllers/patientProfileController.js";

const patientProfileRoutes = express.Router();

patientProfileRoutes.get("/", clerkMiddleware(), requireAuth(), getMyPatientProfile);
patientProfileRoutes.put("/", clerkMiddleware(), requireAuth(), upsertMyPatientProfile);

export default patientProfileRoutes;
