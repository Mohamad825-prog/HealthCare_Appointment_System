import express from "express";
import { updateCashPaymentStatus } from "../controllers/appointmentController.js";
import { updateServiceCashPaymentStatus } from "../controllers/serviceAppointmentController.js";

const adminRouter = express.Router();

adminRouter.patch("/appointments/:id/payment", updateCashPaymentStatus);
adminRouter.patch("/service-appointments/:id/payment", updateServiceCashPaymentStatus);

export default adminRouter;
