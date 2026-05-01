import React, { useEffect, useMemo, useRef, useState } from "react";
import {
    AlertCircle,
    CheckCircle2,
    Eye,
    EyeOff,
    ImagePlus,
    LoaderCircle,
    PencilLine,
    Plus,
    RotateCcw,
    Save,
    ShieldCheck,
    Trash2,
} from "lucide-react";

import {
    DoctorApiError,
    updateDoctorProfile,
} from "../services/doctorApi";

const timeStringToMinutes = (value = "") => {
    const [time = "0:00", ampm = "AM"] = value.split(" ");
    const [rawHour = "0", rawMinute = "00"] = time.split(":");
    let hour = Number(rawHour) % 12;

    if (String(ampm).toUpperCase() === "PM") {
        hour += 12;
    }

    return hour * 60 + Number(rawMinute || 0);
};

const cloneSchedule = (schedule = {}) => {
    const next = {};

    Object.entries(schedule || {}).forEach(([date, slots]) => {
        next[date] = Array.isArray(slots) ? [...slots] : [];
    });

    return next;
};

const buildFormState = (doctorProfile = {}) => ({
    name: doctorProfile.name || "",
    email: doctorProfile.email || "",
    specialization: doctorProfile.specialization || "",
    experience: doctorProfile.experience || "",
    qualifications: doctorProfile.qualifications || "",
    location: doctorProfile.location || "",
    about: doctorProfile.about || "",
    fee: String(doctorProfile.fee ?? 0),
    availability: doctorProfile.availability || "Available",
    success: doctorProfile.success || "",
    patients: doctorProfile.patients || "",
    rating: String(doctorProfile.rating ?? 0),
    password: "",
    schedule: cloneSchedule(doctorProfile.schedule || {}),
});

const formatDateLabel = (value) => {
    if (!value) return "";

    try {
        return new Date(`${value}T00:00:00`).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
        });
    } catch {
        return value;
    }
};

const DoctorProfileEditor = ({
    doctorProfile,
    onProfileUpdated,
    onUnauthorized,
}) => {
    const fileInputRef = useRef(null);

    const [form, setForm] = useState(() => buildFormState(doctorProfile));
    const [imageFile, setImageFile] = useState(null);
    const [imagePreview, setImagePreview] = useState(doctorProfile?.imageUrl || "");
    const [slotDate, setSlotDate] = useState("");
    const [slotHour, setSlotHour] = useState("");
    const [slotMinute, setSlotMinute] = useState("00");
    const [slotAmpm, setSlotAmpm] = useState("AM");
    const [showPassword, setShowPassword] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [successMessage, setSuccessMessage] = useState("");

    useEffect(() => {
        setForm(buildFormState(doctorProfile));
        setImageFile(null);
        setImagePreview(doctorProfile?.imageUrl || "");
        setShowPassword(false);
        setError("");
        setSuccessMessage("");
        setSlotDate("");
        setSlotHour("");
        setSlotMinute("00");
        setSlotAmpm("AM");
        if (fileInputRef.current) {
            try {
                fileInputRef.current.value = "";
            } catch {
                // Ignore input reset issues.
            }
        }
    }, [doctorProfile]);

    useEffect(() => {
        return () => {
            if (imagePreview && imagePreview.startsWith("blob:")) {
                URL.revokeObjectURL(imagePreview);
            }
        };
    }, [imagePreview]);

    const flatSchedule = useMemo(() => {
        return Object.keys(form.schedule || {})
            .sort()
            .flatMap((date) =>
                (form.schedule[date] || []).map((time) => ({ date, time }))
            );
    }, [form.schedule]);

    const isDirty = useMemo(() => {
        const initial = buildFormState(doctorProfile);
        return (
            JSON.stringify(form) !== JSON.stringify(initial) ||
            Boolean(imageFile)
        );
    }, [doctorProfile, form, imageFile]);

    const handleFieldChange = (event) => {
        const { name, value } = event.target;
        setForm((prev) => ({ ...prev, [name]: value }));
        setError("");
        setSuccessMessage("");
    };

    const handleImageChange = (event) => {
        const nextFile = event.target.files?.[0];
        if (!nextFile) return;

        if (imagePreview && imagePreview.startsWith("blob:")) {
            URL.revokeObjectURL(imagePreview);
        }

        setImageFile(nextFile);
        setImagePreview(URL.createObjectURL(nextFile));
        setError("");
        setSuccessMessage("");
    };

    const resetForm = () => {
        if (imagePreview && imagePreview.startsWith("blob:")) {
            URL.revokeObjectURL(imagePreview);
        }

        setForm(buildFormState(doctorProfile));
        setImageFile(null);
        setImagePreview(doctorProfile?.imageUrl || "");
        setSlotDate("");
        setSlotHour("");
        setSlotMinute("00");
        setSlotAmpm("AM");
        setShowPassword(false);
        setError("");
        setSuccessMessage("");

        if (fileInputRef.current) {
            try {
                fileInputRef.current.value = "";
            } catch {
                // Ignore input reset issues.
            }
        }
    };

    const addSlot = () => {
        if (!slotDate || !slotHour) {
            setError("Select a date and hour before adding a schedule slot.");
            return;
        }

        const nextTime = `${Number(slotHour)}:${slotMinute} ${slotAmpm}`;

        setForm((prev) => {
            const nextSchedule = cloneSchedule(prev.schedule);
            const existingSlots = new Set(nextSchedule[slotDate] || []);
            existingSlots.add(nextTime);
            nextSchedule[slotDate] = Array.from(existingSlots).sort(
                (left, right) =>
                    timeStringToMinutes(left) - timeStringToMinutes(right)
            );

            return { ...prev, schedule: nextSchedule };
        });

        setError("");
        setSuccessMessage("");
        setSlotHour("");
        setSlotMinute("00");
        setSlotAmpm("AM");
    };

    const removeSlot = (date, time) => {
        setForm((prev) => {
            const nextSchedule = cloneSchedule(prev.schedule);
            nextSchedule[date] = (nextSchedule[date] || []).filter(
                (slot) => slot !== time
            );

            if (!nextSchedule[date]?.length) {
                delete nextSchedule[date];
            }

            return { ...prev, schedule: nextSchedule };
        });

        setError("");
        setSuccessMessage("");
    };

    const validateForm = () => {
        if (!form.name.trim()) return "Doctor name is required.";
        if (!form.email.trim()) return "Doctor email is required.";
        if (!form.specialization.trim()) return "Specialization is required.";

        const numericFee = Number(form.fee);
        if (Number.isNaN(numericFee) || numericFee < 0) {
            return "Fee must be a valid non-negative number.";
        }

        const numericRating = Number(form.rating);
        if (Number.isNaN(numericRating) || numericRating < 0 || numericRating > 5) {
            return "Rating must be a number between 0 and 5.";
        }

        return "";
    };

    const handleSubmit = async (event) => {
        event.preventDefault();

        const validationError = validateForm();
        if (validationError) {
            setError(validationError);
            setSuccessMessage("");
            return;
        }

        setSaving(true);
        setError("");
        setSuccessMessage("");

        try {
            const payload = new FormData();
            payload.append("name", form.name.trim());
            payload.append("email", form.email.trim());
            payload.append("specialization", form.specialization.trim());
            payload.append("experience", form.experience.trim());
            payload.append("qualifications", form.qualifications.trim());
            payload.append("location", form.location.trim());
            payload.append("about", form.about.trim());
            payload.append("fee", String(Number(form.fee)));
            payload.append("availability", form.availability || "Available");
            payload.append("success", form.success.trim());
            payload.append("patients", form.patients.trim());
            payload.append("rating", String(Number(form.rating)));
            payload.append("schedule", JSON.stringify(form.schedule || {}));

            if (form.password.trim()) {
                payload.append("password", form.password.trim());
            }

            if (imageFile) {
                payload.append("image", imageFile);
            }

            const updatedDoctor = await updateDoctorProfile(doctorProfile.id, payload);
            onProfileUpdated(updatedDoctor);
            setSuccessMessage("Profile updated successfully.");
        } catch (err) {
            if (err instanceof DoctorApiError && err.status === 401) {
                onUnauthorized();
                return;
            }
            setError(err.message || "Unable to update doctor profile.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <article className="rounded-[2rem] border border-emerald-100 bg-white shadow-lg">
            <div className="border-b border-emerald-100 px-5 sm:px-6 py-5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
                            <PencilLine className="w-3.5 h-3.5" />
                            My Profile
                        </div>
                        <h3 className="mt-3 text-xl font-bold text-slate-900">
                            Edit Doctor Profile
                        </h3>
                        <p className="mt-1 text-sm text-slate-500">
                            Update your own doctor information using the protected
                            doctor session. Patient Clerk data is not touched here.
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={resetForm}
                            disabled={saving || !isDirty}
                            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                            <RotateCcw className="w-4 h-4" />
                            Reset
                        </button>
                    </div>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-6">
                    <section className="space-y-4">
                        <div className="rounded-[1.5rem] border border-emerald-100 bg-emerald-50/60 p-5">
                            <p className="text-xs uppercase tracking-[0.2em] text-emerald-700 font-semibold">
                                Profile Photo
                            </p>

                            <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row">
                                <div className="h-28 w-28 overflow-hidden rounded-[1.5rem] border-4 border-white bg-white shadow-sm">
                                    {imagePreview ? (
                                        <img
                                            src={imagePreview}
                                            alt={form.name || "Doctor"}
                                            className="h-full w-full object-cover"
                                        />
                                    ) : (
                                        <div className="flex h-full w-full items-center justify-center bg-emerald-100 text-emerald-700">
                                            <ImagePlus className="w-9 h-9" />
                                        </div>
                                    )}
                                </div>

                                <div className="flex-1">
                                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
                                        <ImagePlus className="w-4 h-4" />
                                        Replace Photo
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            accept="image/*"
                                            onChange={handleImageChange}
                                            className="hidden"
                                        />
                                    </label>
                                    <p className="mt-3 text-xs text-slate-500">
                                        Upload is optional. The existing backend image
                                        upload route and Cloudinary flow are reused here.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="rounded-[1.5rem] border border-emerald-100 bg-emerald-50/60 p-5">
                            <p className="text-xs uppercase tracking-[0.2em] text-emerald-700 font-semibold">
                                Login Fields
                            </p>

                            <div className="mt-4 space-y-4">
                                <label className="block">
                                    <span className="mb-2 block text-sm font-semibold text-slate-700">
                                        Email
                                    </span>
                                    <input
                                        type="email"
                                        name="email"
                                        value={form.email}
                                        onChange={handleFieldChange}
                                        className="w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-emerald-300"
                                    />
                                </label>

                                <label className="block">
                                    <span className="mb-2 block text-sm font-semibold text-slate-700">
                                        New Password
                                    </span>
                                    <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-white px-4 py-3 focus-within:ring-2 focus-within:ring-emerald-300">
                                        <input
                                            type={showPassword ? "text" : "password"}
                                            name="password"
                                            value={form.password}
                                            onChange={handleFieldChange}
                                            placeholder="Leave blank to keep current password"
                                            className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword((prev) => !prev)}
                                            className="text-slate-500 hover:text-slate-700"
                                        >
                                            {showPassword ? (
                                                <EyeOff className="w-4 h-4" />
                                            ) : (
                                                <Eye className="w-4 h-4" />
                                            )}
                                        </button>
                                    </div>
                                </label>
                            </div>
                        </div>
                    </section>

                    <section className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <label className="block sm:col-span-2">
                                <span className="mb-2 block text-sm font-semibold text-slate-700">
                                    Doctor Name
                                </span>
                                <input
                                    type="text"
                                    name="name"
                                    value={form.name}
                                    onChange={handleFieldChange}
                                    className="w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-emerald-300"
                                />
                            </label>

                            <label className="block">
                                <span className="mb-2 block text-sm font-semibold text-slate-700">
                                    Specialization
                                </span>
                                <input
                                    type="text"
                                    name="specialization"
                                    value={form.specialization}
                                    onChange={handleFieldChange}
                                    className="w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-emerald-300"
                                />
                            </label>

                            <label className="block">
                                <span className="mb-2 block text-sm font-semibold text-slate-700">
                                    Availability
                                </span>
                                <select
                                    name="availability"
                                    value={form.availability}
                                    onChange={handleFieldChange}
                                    className="w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-emerald-300"
                                >
                                    <option value="Available">Available</option>
                                    <option value="Unavailable">Unavailable</option>
                                </select>
                            </label>

                            <label className="block">
                                <span className="mb-2 block text-sm font-semibold text-slate-700">
                                    Experience
                                </span>
                                <input
                                    type="text"
                                    name="experience"
                                    value={form.experience}
                                    onChange={handleFieldChange}
                                    placeholder="e.g. 10 Years"
                                    className="w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-emerald-300"
                                />
                            </label>

                            <label className="block">
                                <span className="mb-2 block text-sm font-semibold text-slate-700">
                                    Qualifications
                                </span>
                                <input
                                    type="text"
                                    name="qualifications"
                                    value={form.qualifications}
                                    onChange={handleFieldChange}
                                    className="w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-emerald-300"
                                />
                            </label>

                            <label className="block">
                                <span className="mb-2 block text-sm font-semibold text-slate-700">
                                    Location
                                </span>
                                <input
                                    type="text"
                                    name="location"
                                    value={form.location}
                                    onChange={handleFieldChange}
                                    className="w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-emerald-300"
                                />
                            </label>

                            <label className="block">
                                <span className="mb-2 block text-sm font-semibold text-slate-700">
                                    Fee
                                </span>
                                <input
                                    type="number"
                                    min="0"
                                    step="1"
                                    name="fee"
                                    value={form.fee}
                                    onChange={handleFieldChange}
                                    className="w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-emerald-300"
                                />
                            </label>

                            <label className="block">
                                <span className="mb-2 block text-sm font-semibold text-slate-700">
                                    Patients Info
                                </span>
                                <input
                                    type="text"
                                    name="patients"
                                    value={form.patients}
                                    onChange={handleFieldChange}
                                    className="w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-emerald-300"
                                />
                            </label>

                            <label className="block">
                                <span className="mb-2 block text-sm font-semibold text-slate-700">
                                    Success Info
                                </span>
                                <input
                                    type="text"
                                    name="success"
                                    value={form.success}
                                    onChange={handleFieldChange}
                                    className="w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-emerald-300"
                                />
                            </label>

                            <label className="block">
                                <span className="mb-2 block text-sm font-semibold text-slate-700">
                                    Rating
                                </span>
                                <input
                                    type="number"
                                    min="0"
                                    max="5"
                                    step="0.1"
                                    name="rating"
                                    value={form.rating}
                                    onChange={handleFieldChange}
                                    className="w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-emerald-300"
                                />
                            </label>

                            <label className="block sm:col-span-2">
                                <span className="mb-2 block text-sm font-semibold text-slate-700">
                                    About
                                </span>
                                <textarea
                                    name="about"
                                    value={form.about}
                                    onChange={handleFieldChange}
                                    rows={4}
                                    className="w-full rounded-[1.5rem] border border-emerald-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-emerald-300"
                                />
                            </label>
                        </div>
                    </section>
                </div>

                <section className="rounded-[1.75rem] border border-emerald-100 bg-emerald-50/60 p-5">
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                        <div>
                            <p className="text-xs uppercase tracking-[0.2em] text-emerald-700 font-semibold">
                                Schedule
                            </p>
                            <h4 className="mt-2 text-lg font-bold text-slate-900">
                                Manage Available Slots
                            </h4>
                            <p className="mt-1 text-sm text-slate-500">
                                This uses the same schedule object structure already expected
                                by the backend and patient doctor detail page.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-[1fr_100px_100px_100px_auto] gap-3 w-full lg:w-auto">
                            <input
                                type="date"
                                value={slotDate}
                                onChange={(event) => setSlotDate(event.target.value)}
                                className="rounded-full border border-emerald-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-emerald-300"
                            />
                            <select
                                value={slotHour}
                                onChange={(event) => setSlotHour(event.target.value)}
                                className="rounded-full border border-emerald-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-emerald-300"
                            >
                                <option value="">Hour</option>
                                {Array.from({ length: 12 }).map((_, index) => (
                                    <option key={index + 1} value={String(index + 1)}>
                                        {index + 1}
                                    </option>
                                ))}
                            </select>
                            <select
                                value={slotMinute}
                                onChange={(event) => setSlotMinute(event.target.value)}
                                className="rounded-full border border-emerald-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-emerald-300"
                            >
                                {Array.from({ length: 60 }).map((_, index) => {
                                    const minute = String(index).padStart(2, "0");
                                    return (
                                        <option key={minute} value={minute}>
                                            {minute}
                                        </option>
                                    );
                                })}
                            </select>
                            <select
                                value={slotAmpm}
                                onChange={(event) => setSlotAmpm(event.target.value)}
                                className="rounded-full border border-emerald-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-emerald-300"
                            >
                                <option value="AM">AM</option>
                                <option value="PM">PM</option>
                            </select>
                            <button
                                type="button"
                                onClick={addSlot}
                                className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
                            >
                                <Plus className="w-4 h-4" />
                                Add
                            </button>
                        </div>
                    </div>

                    <div className="mt-5">
                        {flatSchedule.length === 0 ? (
                            <div className="rounded-[1.25rem] border border-dashed border-emerald-200 bg-white px-5 py-6 text-sm text-slate-500">
                                No schedule slots added yet.
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                                {flatSchedule.map(({ date, time }) => (
                                    <div
                                        key={`${date}-${time}`}
                                        className="flex items-center justify-between rounded-[1.25rem] border border-white bg-white px-4 py-3 shadow-sm"
                                    >
                                        <div>
                                            <p className="text-sm font-semibold text-slate-800">
                                                {formatDateLabel(date)}
                                            </p>
                                            <p className="mt-1 text-xs text-slate-500">{time}</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => removeSlot(date, time)}
                                            className="rounded-full border border-rose-200 bg-rose-50 p-2 text-rose-700 hover:bg-rose-100"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </section>

                <div className="rounded-[1.5rem] border border-slate-100 bg-slate-50 px-4 py-4">
                    <div className="flex items-start gap-3 text-sm text-slate-600">
                        <ShieldCheck className="w-5 h-5 mt-0.5 flex-shrink-0 text-emerald-600" />
                        <p>
                            Only the logged-in doctor can update this profile. Empty
                            password keeps the current password unchanged, and Clerk
                            patient authentication is not affected.
                        </p>
                    </div>
                </div>

                {error && (
                    <div className="flex items-start gap-3 rounded-[1.5rem] border border-rose-200 bg-rose-50 px-4 py-3">
                        <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-rose-600" />
                        <p className="text-sm text-rose-700">{error}</p>
                    </div>
                )}

                {successMessage && (
                    <div className="flex items-start gap-3 rounded-[1.5rem] border border-emerald-200 bg-emerald-50 px-4 py-3">
                        <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0 text-emerald-700" />
                        <p className="text-sm text-emerald-700">{successMessage}</p>
                    </div>
                )}

                <div className="flex flex-col sm:flex-row items-center gap-3">
                    <button
                        type="submit"
                        disabled={saving || !isDirty}
                        className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                    >
                        {saving ? (
                            <>
                                <LoaderCircle className="w-4 h-4 animate-spin" />
                                Saving Profile...
                            </>
                        ) : (
                            <>
                                <Save className="w-4 h-4" />
                                Save Changes
                            </>
                        )}
                    </button>

                    <button
                        type="button"
                        onClick={resetForm}
                        disabled={saving || !isDirty}
                        className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                        <RotateCcw className="w-4 h-4" />
                        Cancel
                    </button>
                </div>
            </form>
        </article>
    );
};

export default DoctorProfileEditor;

