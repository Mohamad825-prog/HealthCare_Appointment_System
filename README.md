# Healthcare Appointment System

A full-stack healthcare booking platform for patients, administrators, and doctors. Patients can browse doctors and services, save reusable profile details, book appointments, pay online or by cash, and manage their bookings. The project also includes an admin dashboard for clinic operations and a separate doctor portal for appointment and profile management.

## Overview

The Healthcare Appointment System is designed to simplify healthcare appointment booking and clinic workflow management.

- Patients can explore doctors and healthcare services, use rule-based AI helpers including the FAQ chatbot, save profile information, and book appointments.
- Admins can manage doctors, services, doctor appointments, service appointments, and summary statistics.
- Doctors can sign in through a separate portal, review only their own appointments, and manage their profile, schedule, and availability.

The project uses React with Vite for the frontend applications, Express for the backend API, and Supabase PostgreSQL for data storage. Clerk is used for patient authentication, doctors use JWT-based authentication, Stripe is used for online payments, Cloudinary is used for image uploads, and Nodemailer is used for email notifications when SMTP is configured.

## Main Features

### Patient Side

- Browse doctors and healthcare services
- View doctor details, specialization, fee, availability, and schedule
- Book doctor appointments
- Book service appointments
- Pay online with Stripe or choose cash payment
- Save reusable patient profile details such as name, email, mobile number, age, address, and emergency contact information
- Auto-fill doctor and service booking forms from the saved patient profile
- View personal appointments using Clerk-authenticated identity
- Cancel appointments from the patient appointments page when allowed by backend rules
- Send contact messages to the clinic
- Use the symptom-to-department suggestion helper
- Use the doctor recommendation helper
- Use the FAQ chatbot for common platform questions
- View payment success and cancel pages

### Admin Side

- Manage doctors
- Manage services
- View doctor appointments
- Cancel doctor appointments
- View service appointments
- Update service appointment status
- Reschedule service appointments
- Cancel service appointments
- View patient count, appointment statistics, and revenue summaries
- Upload and update doctor and service images

### Doctor Side

- Sign in through a separate doctor login
- Access a protected doctor dashboard
- View only appointments assigned to the logged-in doctor
- Search and filter appointments by status or patient information
- Confirm appointments
- Mark appointments as completed
- Cancel appointments when allowed
- Edit doctor profile information
- Update fee, specialization, image, availability, and schedule slots

## Recent Updates

- Added a patient profile module with reusable booking defaults
- Added automatic booking-form prefill from saved patient profile data
- Added a rule-based FAQ chatbot for common support questions
- Added email notifications for appointment creation, appointment status changes, and contact form alerts
- Added bcrypt-based doctor password hashing and login-time password upgrade support
- Improved booking validation with stronger slot-conflict prevention and reschedule tracking
- Added backend AI routes for symptom checking, doctor recommendation, and FAQ chat
- Improved backend environment loading and Supabase connection diagnostics

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
- Supabase JavaScript client
- Clerk Express
- Stripe
- Cloudinary
- JWT
- Multer
- Nodemailer
- bcryptjs
- dotenv
- CORS

### Database / Services

- Supabase for database storage
- Clerk for patient authentication
- Stripe for payment processing
- Cloudinary for image storage and management
- SMTP provider for optional email notifications

## Core Data Models

- `doctors`
- `appointments`
- `services`
- `service_appointments`
- `patient_profiles`
- `contact_messages`

## Project Structure

```text
HealthCare_Appointment_System/
|- frontend/   # Patient-facing React app and doctor portal pages
|- admin/      # Admin dashboard
|- backend/    # Express API server
|- README.md
`- Healthcare_Appointment_System_Project_Report.md
```

## Notes

- Patient authentication uses Clerk.
- Doctor authentication uses JWT.
- Online payments require valid Stripe configuration.
- Image upload requires Cloudinary configuration.
- Email notifications require SMTP configuration in the backend environment.
- Patient profile persistence expects a `patient_profiles` table in Supabase.
- The AI helpers, including the FAQ chatbot, are rule-based features and are not machine-learning medical diagnosis tools.
