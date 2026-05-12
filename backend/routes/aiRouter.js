import express from "express";
import { checkSymptoms, faqChat, recommendDoctors } from "../controllers/aiController.js";

const aiRouter = express.Router();

aiRouter.post("/symptom-check", checkSymptoms);
aiRouter.post("/recommend-doctors", recommendDoctors);
aiRouter.post("/faq-chat", faqChat);

export default aiRouter;
