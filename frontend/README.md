# Frontend App

This app is the patient-facing React frontend for the Healthcare Appointment System. It also includes the separate doctor login and doctor dashboard pages used by doctors after JWT-based authentication.

## What This App Contains

- Public patient pages such as home, doctors, services, and contact
- Doctor detail and service detail booking flows
- Patient appointments page
- Patient profile page with reusable saved details
- Stripe payment success and cancel pages
- Rule-based AI helper interfaces for symptom checking and doctor recommendation
- Doctor login page
- Protected doctor dashboard pages inside the same frontend app

## Main Routes

- `/` - Home page
- `/doctors` - Doctors listing
- `/doctors/:id` - Doctor detail and booking page
- `/services` - Services listing
- `/services/:id` - Service detail and booking page
- `/appointments` - Patient appointments page
- `/profile` - Patient profile page
- `/contact` - Contact page
- `/appointment/success` and `/appointment/cancel` - Doctor payment result pages
- `/service-appointment/success` and `/service-appointment/cancel` - Service payment result pages
- `/doctor-admin/login` - Doctor login
- `/doctor-admin/dashboard` - Protected doctor dashboard

## Key Features

- Clerk-based patient authentication
- Patient profile auto-fill for booking forms
- Separate doctor portal flow
- Scroll restoration between route navigations
- Rule-based AI helper UI components
- Integration with backend booking, profile, and payment APIs

## Local Development

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Other scripts:

```bash
npm run build
npm run preview
npm run lint
```

## Environment

Create a local `.env` file in the `frontend` folder with:

```env
VITE_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
```

Optional:

```env
VITE_API_URL=http://localhost:4000
```

Note:

- The patient profile service supports `VITE_API_URL`.
- Most other frontend API calls currently expect the backend to be available at `http://localhost:4000`.
- The backend CORS setup currently allows local frontend origins such as `http://localhost:5173` and `http://localhost:5174`.

## Project Structure

```text
frontend/
|- src/
|  |- components/   # Reusable UI and helper components
|  |- pages/        # Main application pages
|  |- services/     # API helper modules
|  |- utils/        # Authentication and local helpers
|  |- assets/       # Images and shared style objects
|  |- App.jsx       # Route definitions
|  `- main.jsx      # App entry with ClerkProvider and BrowserRouter
|- package.json
`- vite.config.js
```

## Notes

- Patient sign-in uses Clerk.
- Doctor sign-in is separate and uses backend-issued JWT tokens.
- Stripe success pages depend on the backend payment confirmation routes.
- Booking and profile flows work best when the backend, Clerk, Stripe, and Supabase are configured and running correctly.
