import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { SignedIn, SignedOut, useAuth, useClerk, useUser } from "@clerk/clerk-react";
import {
    AlertCircle,
    CalendarDays,
    CheckCircle2,
    ClipboardList,
    LoaderCircle,
    Lock,
    Save,
    ShieldCheck,
    UserRound,
} from "lucide-react";

import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { getPatientProfile, updatePatientProfile } from "../services/patientProfileApi";

const defaultForm = {
    fullName: "",
    email: "",
    mobile: "",
    age: "",
    dateOfBirth: "",
    gender: "",
    address: "",
    emergencyContactName: "",
    emergencyContactPhone: "",
};

const Field = ({
    label,
    name,
    value,
    onChange,
    type = "text",
    placeholder = "",
    required = false,
}) => (
    <label className="block">
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
            {label} {required ? <span className="text-rose-500">*</span> : null}
        </span>
        <input
            name={name}
            type={type}
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            className="w-full rounded-2xl border border-emerald-100 bg-white px-4 py-3 text-sm text-gray-700 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-200"
        />
    </label>
);

const TextAreaField = ({ label, name, value, onChange, placeholder = "" }) => (
    <label className="block">
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
            {label}
        </span>
        <textarea
            name={name}
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            rows={4}
            className="w-full rounded-2xl border border-emerald-100 bg-white px-4 py-3 text-sm text-gray-700 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-200"
        />
    </label>
);

const SelectField = ({ label, name, value, onChange, options = [] }) => (
    <label className="block">
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
            {label}
        </span>
        <select
            name={name}
            value={value}
            onChange={onChange}
            className="w-full rounded-2xl border border-emerald-100 bg-white px-4 py-3 text-sm text-gray-700 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-200"
        >
            {options.map((option) => (
                <option key={option.value} value={option.value}>
                    {option.label}
                </option>
            ))}
        </select>
    </label>
);

const Profile = () => {
    const { isLoaded, isSignedIn, getToken } = useAuth();
    const { user } = useUser();
    const clerk = useClerk();

    const [form, setForm] = useState(defaultForm);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const primaryEmail = user?.primaryEmailAddress?.emailAddress || "";

    useEffect(() => {
        if (!isLoaded) return;
        if (!isSignedIn) {
            setLoading(false);
            return;
        }

        let cancelled = false;

        const run = async () => {
            setLoading(true);
            setError("");
            setSuccess("");

            try {
                const profile = await getPatientProfile(getToken);
                if (cancelled) return;

                setForm({
                    fullName: profile?.fullName || user?.fullName || "",
                    email: profile?.email || primaryEmail,
                    mobile: profile?.mobile || "",
                    age: profile?.age != null ? String(profile.age) : "",
                    dateOfBirth: profile?.dateOfBirth || "",
                    gender: profile?.gender || "",
                    address: profile?.address || "",
                    emergencyContactName: profile?.emergencyContactName || "",
                    emergencyContactPhone: profile?.emergencyContactPhone || "",
                });
            } catch (fetchError) {
                if (cancelled) return;
                setError(fetchError.message || "Unable to load your profile.");
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        run();

        return () => {
            cancelled = true;
        };
    }, [getToken, isLoaded, isSignedIn, primaryEmail, user]);

    const handleChange = (event) => {
        const { name, value } = event.target;
        setForm((current) => ({
            ...current,
            [name]: value,
        }));
        setError("");
        setSuccess("");
    };

    const profileHighlights = useMemo(
        () => [
            {
                title: "Faster booking",
                text: "Your saved details can automatically fill doctor and service booking forms.",
            },
            {
                title: "Emergency info ready",
                text: "Keep your emergency contact handy without retyping it every time.",
            },
            {
                title: "You stay in control",
                text: "Patients can still edit the booking details before confirming any appointment.",
            },
        ],
        []
    );

    const handleSubmit = async (event) => {
        event.preventDefault();
        setSaving(true);
        setError("");
        setSuccess("");

        try {
            const payload = {
                fullName: form.fullName.trim(),
                email: form.email.trim(),
                mobile: form.mobile.trim(),
                age: form.age === "" ? null : Number(form.age),
                dateOfBirth: form.dateOfBirth || "",
                gender: form.gender.trim(),
                address: form.address.trim(),
                emergencyContactName: form.emergencyContactName.trim(),
                emergencyContactPhone: form.emergencyContactPhone.trim(),
            };

            const savedProfile = await updatePatientProfile(getToken, payload);

            setForm({
                fullName: savedProfile?.fullName || payload.fullName,
                email: savedProfile?.email || payload.email,
                mobile: savedProfile?.mobile || payload.mobile,
                age: savedProfile?.age != null ? String(savedProfile.age) : "",
                dateOfBirth: savedProfile?.dateOfBirth || "",
                gender: savedProfile?.gender || "",
                address: savedProfile?.address || "",
                emergencyContactName: savedProfile?.emergencyContactName || "",
                emergencyContactPhone: savedProfile?.emergencyContactPhone || "",
            });
            setSuccess("Your patient profile has been saved successfully.");
        } catch (saveError) {
            setError(saveError.message || "Unable to save your patient profile.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="min-h-screen font-serif">
            <Navbar />

            <section className="relative overflow-hidden bg-linear-to-br from-emerald-50 via-white to-teal-50 py-16 sm:py-20">
                <div
                    className="pointer-events-none absolute top-0 right-0 h-96 w-96 translate-x-1/3 -translate-y-1/3 rounded-full bg-emerald-100 opacity-40 blur-3xl"
                    aria-hidden="true"
                />
                <div
                    className="pointer-events-none absolute bottom-0 left-0 h-80 w-80 -translate-x-1/3 translate-y-1/3 rounded-full bg-teal-100 opacity-30 blur-3xl"
                    aria-hidden="true"
                />

                <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                    <div className="mx-auto max-w-3xl text-center">
                        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-100 px-4 py-2 text-sm font-semibold text-emerald-700">
                            <UserRound className="h-4 w-4" />
                            Saved Patient Details
                        </div>

                        <h1 className="mb-4 font-[pacifico] text-4xl font-bold leading-tight text-gray-900 sm:text-5xl lg:text-6xl">
                            My{" "}
                            <span className="bg-linear-to-r from-emerald-600 to-teal-500 bg-clip-text text-transparent">
                                Profile
                            </span>
                        </h1>

                        <p className="mx-auto max-w-2xl text-lg leading-relaxed text-gray-500">
                            Save your personal details once, then reuse them during doctor and
                            service booking without filling the same information each time.
                        </p>
                    </div>
                </div>
            </section>

            <main className="bg-linear-to-br from-emerald-50 via-white to-teal-50 pb-16">
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                    <SignedOut>
                        <section className="mx-auto max-w-3xl py-12">
                            <div className="rounded-3xl border border-emerald-100 bg-white p-8 text-center shadow-sm">
                                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border-2 border-emerald-200 bg-emerald-50">
                                    <Lock className="h-7 w-7 text-emerald-500" />
                                </div>
                                <h2 className="text-2xl font-bold text-gray-900">Sign in to manage your profile</h2>
                                <p className="mt-3 text-sm leading-relaxed text-gray-500">
                                    Your patient profile is linked to your Clerk account so your saved
                                    details stay connected to your bookings.
                                </p>
                                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                                    <button
                                        onClick={() => clerk.openSignIn()}
                                        className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-6 py-3 font-semibold text-white transition hover:bg-emerald-700"
                                    >
                                        <Lock className="h-4 w-4" />
                                        Sign In
                                    </button>
                                    <Link
                                        to="/appointments"
                                        className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-6 py-3 font-semibold text-emerald-700 transition hover:bg-emerald-50"
                                    >
                                        <CalendarDays className="h-4 w-4" />
                                        My Appointments
                                    </Link>
                                </div>
                            </div>
                        </section>
                    </SignedOut>

                    <SignedIn>
                        <section className="grid gap-6 py-10 lg:grid-cols-[1.15fr_0.85fr]">
                            <article className="overflow-hidden rounded-3xl border border-emerald-100 bg-white shadow-sm">
                                <div className="bg-linear-to-r from-emerald-500 to-teal-500 px-6 py-5 text-white">
                                    <h2 className="flex items-center gap-2 text-xl font-semibold">
                                        <ClipboardList className="h-5 w-5" />
                                        Patient Profile Form
                                    </h2>
                                    <p className="mt-1 text-sm text-emerald-50">
                                        These details are stored against your Clerk account and used as
                                        safe booking defaults.
                                    </p>
                                </div>

                                <div className="p-6 sm:p-8">
                                    {loading ? (
                                        <div className="flex min-h-[280px] items-center justify-center text-emerald-700">
                                            <LoaderCircle className="mr-3 h-5 w-5 animate-spin" />
                                            Loading your profile...
                                        </div>
                                    ) : (
                                        <form onSubmit={handleSubmit} className="space-y-6">
                                            <div className="grid gap-4 sm:grid-cols-2">
                                                <Field
                                                    label="Full Name"
                                                    name="fullName"
                                                    value={form.fullName}
                                                    onChange={handleChange}
                                                    placeholder="e.g. John Smith"
                                                    required
                                                />
                                                <Field
                                                    label="Email"
                                                    name="email"
                                                    type="email"
                                                    value={form.email}
                                                    onChange={handleChange}
                                                    placeholder="you@example.com"
                                                />
                                                <Field
                                                    label="Mobile Phone"
                                                    name="mobile"
                                                    value={form.mobile}
                                                    onChange={handleChange}
                                                    placeholder="+961 70 123 456"
                                                />
                                                <Field
                                                    label="Age"
                                                    name="age"
                                                    type="number"
                                                    value={form.age}
                                                    onChange={handleChange}
                                                    placeholder="e.g. 29"
                                                />
                                                <Field
                                                    label="Date of Birth"
                                                    name="dateOfBirth"
                                                    type="date"
                                                    value={form.dateOfBirth}
                                                    onChange={handleChange}
                                                />
                                                <SelectField
                                                    label="Gender"
                                                    name="gender"
                                                    value={form.gender}
                                                    onChange={handleChange}
                                                    options={[
                                                        { value: "", label: "Select gender" },
                                                        { value: "Male", label: "Male" },
                                                        { value: "Female", label: "Female" },
                                                        { value: "Other", label: "Other" },
                                                        { value: "Prefer not to say", label: "Prefer not to say" },
                                                    ]}
                                                />
                                                <div className="sm:col-span-2">
                                                    <TextAreaField
                                                        label="Address"
                                                        name="address"
                                                        value={form.address}
                                                        onChange={handleChange}
                                                        placeholder="Street, building, city, and any useful details"
                                                    />
                                                </div>
                                                <Field
                                                    label="Emergency Contact Name"
                                                    name="emergencyContactName"
                                                    value={form.emergencyContactName}
                                                    onChange={handleChange}
                                                    placeholder="e.g. Sarah Smith"
                                                />
                                                <Field
                                                    label="Emergency Contact Phone"
                                                    name="emergencyContactPhone"
                                                    value={form.emergencyContactPhone}
                                                    onChange={handleChange}
                                                    placeholder="+961 71 987 654"
                                                />
                                            </div>

                                            {error ? (
                                                <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                                                    <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                                                    <span>{error}</span>
                                                </div>
                                            ) : null}

                                            {success ? (
                                                <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                                                    <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
                                                    <span>{success}</span>
                                                </div>
                                            ) : null}

                                            <div className="flex flex-wrap items-center gap-3">
                                                <button
                                                    type="submit"
                                                    disabled={saving}
                                                    className="inline-flex items-center gap-2 rounded-full bg-linear-to-r from-emerald-600 to-teal-500 px-6 py-3 font-semibold text-white shadow-md transition hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                                                >
                                                    {saving ? (
                                                        <>
                                                            <LoaderCircle className="h-4 w-4 animate-spin" />
                                                            Saving...
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Save className="h-4 w-4" />
                                                            Save Profile
                                                        </>
                                                    )}
                                                </button>

                                                <Link
                                                    to="/appointments"
                                                    className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-6 py-3 font-semibold text-emerald-700 transition hover:bg-emerald-50"
                                                >
                                                    <CalendarDays className="h-4 w-4" />
                                                    My Appointments
                                                </Link>
                                            </div>
                                        </form>
                                    )}
                                </div>
                            </article>

                            <aside className="space-y-6">
                                <div className="rounded-3xl border border-emerald-100 bg-white p-6 shadow-sm">
                                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
                                        <ShieldCheck className="h-6 w-6" />
                                    </div>
                                    <h3 className="text-lg font-bold text-gray-900">How this works</h3>
                                    <p className="mt-2 text-sm leading-relaxed text-gray-500">
                                        This profile stores basic patient contact details only. It does
                                        not store passwords or medical diagnosis data.
                                    </p>
                                    <div className="mt-5 space-y-4">
                                        {profileHighlights.map((item) => (
                                            <div
                                                key={item.title}
                                                className="rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-3"
                                            >
                                                <h4 className="font-semibold text-emerald-800">{item.title}</h4>
                                                <p className="mt-1 text-sm leading-relaxed text-emerald-700/80">
                                                    {item.text}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="rounded-3xl border border-teal-100 bg-white p-6 shadow-sm">
                                    <h3 className="text-lg font-bold text-gray-900">Helpful note</h3>
                                    <p className="mt-2 text-sm leading-relaxed text-gray-500">
                                        If a booking form field is left empty, the backend can also use
                                        your saved profile as a fallback. You can still edit any booking
                                        details before submitting.
                                    </p>
                                </div>
                            </aside>
                        </section>
                    </SignedIn>
                </div>
            </main>

            <Footer />
        </div>
    );
};

export default Profile;
