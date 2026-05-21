import express from "express";
import { clerkMiddleware, requireAuth } from "@clerk/express";
import {
    getAdminServiceTestResultByAppointment,
    getMyServiceTestResultByAppointment,
    getMyServiceTestResults,
    hideServiceTestResult,
    publishServiceTestResult,
    upsertServiceTestResult,
} from "../controllers/serviceTestResultController.js";
import serviceResultUpload from "../middlewares/serviceResultUpload.js";

const serviceTestResultRouter = express.Router();

serviceTestResultRouter.get(
    "/admin/service-appointments/:appointmentId/result",
    getAdminServiceTestResultByAppointment
);
serviceTestResultRouter.put(
    "/admin/service-appointments/:appointmentId/result",
    serviceResultUpload.single("resultFile"),
    upsertServiceTestResult
);
serviceTestResultRouter.patch(
    "/admin/service-appointments/:appointmentId/result/publish",
    publishServiceTestResult
);
serviceTestResultRouter.patch(
    "/admin/service-appointments/:appointmentId/result/hide",
    hideServiceTestResult
);

serviceTestResultRouter.get(
    "/my-service-results",
    clerkMiddleware(),
    requireAuth(),
    getMyServiceTestResults
);
serviceTestResultRouter.get(
    "/my-service-appointments/:appointmentId/result",
    clerkMiddleware(),
    requireAuth(),
    getMyServiceTestResultByAppointment
);

export default serviceTestResultRouter;
