import express from "express";
import { createContactMessage } from "../controllers/contactController.js";

const contactRouter = express.Router();

contactRouter.post("/", createContactMessage);

export default contactRouter;
