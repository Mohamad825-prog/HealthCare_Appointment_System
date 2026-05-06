# Admin App

This app is the admin dashboard for the Healthcare Appointment System. It is a separate React application used for operational clinic management, including doctor management, service management, and appointment monitoring.

## What This App Contains

- Admin sign-in gate using Clerk
- Dashboard summary pages
- Doctor creation and listing pages
- Service creation, listing, and editing pages
- Doctor appointments management page
- Service appointments management page
- Service statistics and revenue summary page

## Main Routes

- `/` - Admin landing / hero page
- `/h` - Protected admin home/dashboard
- `/add` - Add doctor
- `/list` - List doctors
- `/appointments` - Doctor appointments management
- `/service-dashboard` - Service statistics dashboard
- `/add-service` - Add service
- `/list-service` - List and edit services
- `/service-appointments` - Service appointments management

All management routes except `/` are wrapped in Clerk-based route protection inside `src/App.jsx`.

## Key Features

- Clerk-protected admin dashboard access
- Add and delete doctors
- Add, edit, and delete services
- View doctor appointments and cancel them when needed
- View service appointments, update status, reschedule, and cancel
- Revenue and activity summaries based on backend data
- Doctor and service image upload integration through the backend

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

Create a local `.env` file in the `admin` folder with:

```env
VITE_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
```

Notes:

- The admin app currently expects the backend API to be available at `http://localhost:4000`.
- The backend CORS setup currently allows local admin/frontend origins such as `http://localhost:5173` and `http://localhost:5174`.
- This app uses Clerk to protect admin-side routes on the frontend. Backend admin authorization is not implemented as a separate admin token system in this app.

## Project Structure

```text
admin/
|- src/
|  |- components/   # Dashboard, list, add, and management components
|  |- pages/        # Route-level page wrappers
|  |- assets/       # Images and shared style objects
|  |- App.jsx       # Route definitions and RequireAuth wrapper
|  `- main.jsx      # App entry with ClerkProvider and BrowserRouter
|- package.json
`- vite.config.js
```

## Notes

- This app is focused on clinic operations, not patient booking.
- Service appointment management is more advanced than doctor appointment management in the current implementation.
- Contact messages are saved by the backend, but a dedicated admin contact-message management page is not currently present in this app.
