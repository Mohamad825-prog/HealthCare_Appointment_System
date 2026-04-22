# Healthcare Appointment System

A full-stack healthcare booking platform that allows patients to browse doctors and services, book appointments, manage their bookings, and complete payments online or by cash. The project also includes an admin panel for managing doctors, services, appointments, and overall system activity.

## Overview

The Healthcare Appointment System is designed to simplify the process of booking healthcare-related appointments. Patients can explore available doctors and healthcare services, choose a suitable date and time, and confirm their booking through either cash or online payment. Doctors and services are stored in Supabase, authentication is handled with Clerk, and Stripe is used for online payments. The project also supports image uploads through Cloudinary.

## Main Features

### Patient Side
- Browse doctors and healthcare services
- View doctor details, specialization, fee, availability, and schedule
- Book doctor appointments
- Book service appointments
- Pay online with Stripe or choose cash payment
- View personal appointments using authenticated user identity from Clerk
- Reschedule or cancel appointments depending on status rules in the backend

### Admin Side
- Manage doctors
- Manage services
- View all doctor appointments
- View all service appointments
- View appointment statistics and revenue summaries
- Toggle doctor availability
- Upload and update doctor and service images

## Tech Stack

### Frontend
- React 19
- Vite
- React Router DOM
- Tailwind CSS
- Clerk React
- Lucide React

### Backend
- Node.js
- Express
- Supabase
- Clerk Express
- Stripe
- Cloudinary
- JWT
- Multer
- CORS

### Database / Services
- Supabase for database
- Clerk for authentication
- Stripe for payment processing
- Cloudinary for image storage and management

## Project Structure

```bash
Healthcare-Appointment-System/
│
├── frontend/        # Patient-facing React app
├── admin/           # Admin dashboard
├── backend/         # Express API server
├── .gitignore
└── README.md
