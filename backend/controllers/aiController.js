import { supabase } from "../config/supabase.js";

const LOW_CONFIDENCE_MESSAGE =
    "We could not confidently determine a department. Please choose General Medicine or browse doctors manually.";

const NO_RECOMMENDATION_MESSAGE =
    "We could not find strong doctor matches for these preferences. Please adjust your filters or browse doctors manually.";

const FAQ_FALLBACK_REPLY =
    "I can help with booking, canceling, rescheduling, payments, doctors, services, and account access. Please ask your question in a different way.";

const departmentKeywordMap = {
    "General Medicine": [
        "fever",
        "high fever",
        "chills",
        "headache",
        "fatigue",
        "cough",
        "cold",
        "weakness",
        "sore throat",
        "body pain",
        "flu",
        "vomiting",
        "nausea",
        "diarrhea",
        "stomach pain",
        "abdominal pain",
        "loss of appetite",
        "general checkup",
        "checkup",
    ],
    ENT: [
        "ear pain",
        "earache",
        "ear infection",
        "blocked ear",
        "ear",
        "nose",
        "runny nose",
        "stuffy nose",
        "nasal congestion",
        "sinus",
        "sinus headache",
        "headache",
        "throat",
        "tonsils",
        "hearing",
        "hearing loss",
        "loss of hearing",
        "sneezing",
        "voice change",
        "hoarseness",
    ],
    Dermatology: [
        "skin",
        "rash",
        "acne",
        "itching",
        "itchy skin",
        "eczema",
        "redness",
        "allergy",
        "hives",
        "dry skin",
        "skin infection",
        "mole",
        "wart",
        "hair loss",
        "dandruff",
        "burn",
    ],
    Dentistry: [
        "tooth",
        "teeth",
        "gum",
        "dental",
        "mouth pain",
        "tooth pain",
        "toothache",
        "jaw pain",
        "cavity",
        "swollen gum",
        "bleeding gum",
        "bad breath",
        "wisdom tooth",
    ],
    Ophthalmology: [
        "eye",
        "vision",
        "blurred vision",
        "blurry vision",
        "double vision",
        "red eye",
        "eye pain",
        "watery eyes",
        "dry eyes",
        "eye redness",
        "eye infection",
        "eye swelling",
        "itchy eyes",
    ],
    Cardiology: [
        "chest pain",
        "chest pressure",
        "heart",
        "heart pain",
        "heart and arteries",
        "arteries",
        "palpitations",
        "fast heartbeat",
        "irregular heartbeat",
        "shortness of breath",
        "blood pressure",
        "high blood pressure",
        "low blood pressure",
        "hypertension",
        "chest tightness",
    ],
    Orthopedics: [
        "bone",
        "joint",
        "joint pain",
        "back pain",
        "neck pain",
        "hip pain",
        "knee pain",
        "ankle pain",
        "wrist pain",
        "shoulder pain",
        "muscle pain",
        "fracture",
        "sprain",
        "arthritis",
        "sports injury",
    ],
    Neurology: [
        "migraine",
        "dizziness",
        "vertigo",
        "seizure",
        "numbness",
        "tingling",
        "fainting",
        "memory loss",
        "tremor",
        "stroke",
        "severe headache",
        "nerve pain",
    ],
    Pediatrics: [
        "child",
        "children",
        "baby",
        "infant",
        "newborn",
        "toddler",
        "kid",
        "kids",
        "pediatric",
        "pediatrician",
        "pediatricians",
        "pediatrics",
        "child fever",
        "baby fever",
        "child cough",
        "baby cough",
        "child checkup",
        "vaccination",
        "vaccine",
    ],
    "Gynecological Diseases": [
        "pelvic pain",
        "period pain",
        "menstrual pain",
        "irregular periods",
        "missed period",
        "heavy bleeding",
        "vaginal discharge",
        "vaginal itching",
        "ovarian cyst",
        "uterine pain",
        "pregnancy checkup",
        "gynecological",
        "gynecology",
    ],
    "Kidneys and Urinary Tract": [
        "kidney pain",
        "kidney stone",
        "flank pain",
        "painful urination",
        "burning urination",
        "frequent urination",
        "blood in urine",
        "urinary tract infection",
        "uti",
        "urine infection",
        "bladder pain",
        "difficulty urinating",
        "urinary retention",
        "urinary leakage",
        "kidneys",
        "urinary tract",
    ],
    Nutritionist: [
        "nutrition",
        "nutritionist",
        "diet",
        "diet plan",
        "meal plan",
        "healthy eating",
        "weight loss",
        "weight gain",
        "obesity",
        "overweight",
        "underweight",
        "malnutrition",
        "dietitian",
        "dietician",
    ],
};

const normalizeSymptoms = (text = "") =>
    String(text)
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const containsKeyword = (normalizedInput, keyword) => {
    const normalizedKeyword = normalizeSymptoms(keyword);
    const keywordPattern = new RegExp(`(^|\\s)${escapeRegExp(normalizedKeyword)}(\\s|$)`);

    return keywordPattern.test(normalizedInput);
};

const getDepartmentSuggestions = (normalizedInput) =>
    Object.entries(departmentKeywordMap)
        .map(([department, keywords]) => {
            const matchedKeywords = keywords.filter((keyword) =>
                containsKeyword(normalizedInput, keyword)
            );

            return {
                department,
                score: matchedKeywords.length,
                matchedKeywords,
            };
        })
        .filter((suggestion) => suggestion.score > 0)
        .sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return a.department.localeCompare(b.department);
        })
        .slice(0, 3);

const normalizeValue = (value = "") =>
    String(value)
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

const specializationAliases = {
    cardiologist: "cardiology",
    cardiologists: "cardiology",
    dermatologist: "dermatology",
    dermatologists: "dermatology",
    dentist: "dentistry",
    dentists: "dentistry",
    pediatrician: "pediatrics",
    pediatricians: "pediatrics",
    paediatrician: "pediatrics",
    paediatricians: "pediatrics",
    gynecologist: "gynecological diseases",
    gynecologists: "gynecological diseases",
    gynaecologist: "gynecological diseases",
    gynaecologists: "gynecological diseases",
    gynecology: "gynecological diseases",
    gynaecology: "gynecological diseases",
    obgyn: "gynecological diseases",
    "ob gyn": "gynecological diseases",
    obstetrics: "gynecological diseases",
    urologist: "kidneys and urinary tract",
    urologists: "kidneys and urinary tract",
    urology: "kidneys and urinary tract",
    nephrologist: "kidneys and urinary tract",
    nephrologists: "kidneys and urinary tract",
    nephrology: "kidneys and urinary tract",
    nutrition: "nutritionist",
    nutritionist: "nutritionist",
    nutritionists: "nutritionist",
    dietitian: "nutritionist",
    dietitians: "nutritionist",
    dietician: "nutritionist",
    dieticians: "nutritionist",
    ophthalmologist: "ophthalmology",
    ophthalmologists: "ophthalmology",
    neurologist: "neurology",
    neurologists: "neurology",
    orthopedist: "orthopedics",
    orthopedists: "orthopedics",
    orthopaedist: "orthopedics",
    orthopaedists: "orthopedics",
};

const faqIntentConfigs = [
    {
        intent: "book_appointment",
        reply:
            "To book an appointment, open the Doctors page, choose a doctor, select an available date and time, then confirm your booking from the appointment form. You can also browse doctors by specialization before booking.",
        keywords: [
            { term: "how to book", weight: 5 },
            { term: "book appointment", weight: 5 },
            { term: "booking appointment", weight: 4 },
            { term: "book doctor", weight: 4 },
            { term: "make appointment", weight: 4 },
            { term: "book visit", weight: 4 },
            { term: "see doctor", weight: 3 },
            { term: "schedule appointment", weight: 4 },
            { term: "schedule doctor", weight: 4 },
            { term: "set appointment", weight: 3 },
            { term: "consultation", weight: 2 },
            { term: "slot", weight: 2 },
            { term: "available slot", weight: 3 },
            { term: "reserve", weight: 3 },
            { term: "booking", weight: 2 },
            { term: "book", weight: 2 },
            { term: "appointment", weight: 1 },
        ],
    },
    {
        intent: "cancel_appointment",
        reply:
            "You can cancel your appointment from your Appointments page. Open your booked appointments and use the cancel option if it is available. If you cannot cancel it there, please contact support or use the Contact page for help.",
        keywords: [
            { term: "how to cancel", weight: 5 },
            { term: "cancel appointment", weight: 5 },
            { term: "cancel booking", weight: 4 },
            { term: "remove appointment", weight: 4 },
            { term: "delete booking", weight: 4 },
            { term: "cancel visit", weight: 4 },
            { term: "call off appointment", weight: 4 },
            { term: "stop appointment", weight: 3 },
            { term: "cancel", weight: 3 },
            { term: "appointment", weight: 1 },
        ],
    },
    {
        intent: "reschedule_appointment",
        reply:
            "To reschedule an appointment, go to your Appointments page and look for the update or reschedule option. You can usually change the date or time there. If that is not available for your booking, contact support for help.",
        keywords: [
            { term: "reschedule appointment", weight: 5 },
            { term: "reschedule", weight: 4 },
            { term: "change time", weight: 4 },
            { term: "change date", weight: 4 },
            { term: "move appointment", weight: 4 },
            { term: "change appointment", weight: 4 },
            { term: "edit appointment", weight: 4 },
            { term: "another date", weight: 3 },
            { term: "another time", weight: 3 },
            { term: "postpone appointment", weight: 4 },
            { term: "update appointment", weight: 3 },
            { term: "appointment", weight: 1 },
        ],
    },
    {
        intent: "payment_help",
        reply:
            "This platform supports cash payments and online card payments. Online payments go through the online checkout flow, while cash bookings can be completed with the cash option when it is available. You can also check the fee shown before confirming your booking.",
        keywords: [
            { term: "online payment", weight: 4 },
            { term: "cash payment", weight: 4 },
            { term: "card payment", weight: 4 },
            { term: "how to pay", weight: 4 },
            { term: "payment", weight: 3 },
            { term: "cash", weight: 2 },
            { term: "card", weight: 2 },
            { term: "visa", weight: 2 },
            { term: "mastercard", weight: 2 },
            { term: "stripe", weight: 2 },
            { term: "fee", weight: 2 },
            { term: "fees", weight: 2 },
            { term: "price", weight: 2 },
            { term: "cost", weight: 2 },
            { term: "how much", weight: 2 },
            { term: "paid", weight: 2 },
            { term: "unpaid", weight: 2 },
            { term: "pay", weight: 2 },
        ],
    },
    {
        intent: "doctor_selection",
        reply:
            "You can browse doctors by specialization on the Doctors page. If you are unsure which doctor to choose, use the department suggestion and doctor recommendation helpers on the home page to narrow the best match.",
        keywords: [
            { term: "choose doctor", weight: 4 },
            { term: "find doctor", weight: 4 },
            { term: "best doctor", weight: 3 },
            { term: "which doctor", weight: 4 },
            { term: "recommend doctor", weight: 4 },
            { term: "available doctor", weight: 3 },
            { term: "which specialist", weight: 4 },
            { term: "specialization", weight: 3 },
            { term: "speciality", weight: 3 },
            { term: "department", weight: 3 },
            { term: "specialist", weight: 3 },
            { term: "doctor", weight: 2 },
        ],
    },
    {
        intent: "service_booking",
        reply:
            "You can browse available services from the Services page, open the service you need, and continue with the service booking flow if that service is available. This is useful for things like lab tests, scans, and other medical services.",
        keywords: [
            { term: "book service", weight: 5 },
            { term: "service booking", weight: 4 },
            { term: "medical service", weight: 3 },
            { term: "service", weight: 2 },
            { term: "book test", weight: 4 },
            { term: "book scan", weight: 4 },
            { term: "book lab", weight: 4 },
            { term: "lab", weight: 3 },
            { term: "laboratory", weight: 3 },
            { term: "blood test", weight: 3 },
            { term: "scan", weight: 3 },
            { term: "ultrasound", weight: 3 },
            { term: "x ray", weight: 3 },
            { term: "mri", weight: 3 },
            { term: "test", weight: 2 },
        ],
    },
    {
        intent: "login_help",
        reply:
            "Use the Sign In or Sign Up options to access your patient account. After logging in, you can manage appointments, payments, profile details, and other patient actions from your account. If you cannot log in, try signing in again or creating an account if you are new.",
        keywords: [
            { term: "sign in", weight: 4 },
            { term: "create account", weight: 4 },
            { term: "sign up", weight: 3 },
            { term: "register", weight: 3 },
            { term: "login", weight: 3 },
            { term: "log in", weight: 3 },
            { term: "cannot login", weight: 4 },
            { term: "cant login", weight: 4 },
            { term: "forgot password", weight: 4 },
            { term: "forgot my password", weight: 4 },
            { term: "account", weight: 2 },
            { term: "clerk", weight: 2 },
        ],
    },
    {
        intent: "profile_help",
        reply:
            "You can update your patient details from the Profile page. Use it to review or edit your account information when needed.",
        keywords: [
            { term: "profile", weight: 4 },
            { term: "patient profile", weight: 4 },
            { term: "edit profile", weight: 4 },
            { term: "update profile", weight: 4 },
            { term: "my details", weight: 3 },
            { term: "my information", weight: 3 },
        ],
    },
    {
        intent: "appointment_status",
        reply:
            "Appointment statuses on this platform can include Pending, Confirmed, Rescheduled, Completed, and Canceled. You can check the latest status from your Appointments page to see whether your booking is still pending or already confirmed.",
        keywords: [
            { term: "appointment status", weight: 5 },
            { term: "track appointment", weight: 4 },
            { term: "where is my appointment", weight: 4 },
            { term: "is my appointment confirmed", weight: 4 },
            { term: "my booking status", weight: 4 },
            { term: "rescheduled", weight: 3 },
            { term: "confirmed", weight: 3 },
            { term: "completed", weight: 3 },
            { term: "canceled", weight: 3 },
            { term: "cancelled", weight: 3 },
            { term: "pending", weight: 3 },
            { term: "status", weight: 3 },
        ],
    },
    {
        intent: "contact_support",
        reply:
            "If you need extra help, you can use the Contact page or reach out to support/admin. This is useful when booking, cancellation, or account issues cannot be resolved directly in the app.",
        keywords: [
            { term: "contact support", weight: 5 },
            { term: "need help", weight: 4 },
            { term: "support", weight: 3 },
            { term: "contact", weight: 3 },
            { term: "admin", weight: 3 },
            { term: "phone number", weight: 3 },
            { term: "email support", weight: 3 },
            { term: "help desk", weight: 3 },
        ],
    },
    {
        intent: "greeting",
        reply:
            "Hi! I can help with booking appointments, canceling, rescheduling, payments, doctor selection, services, account access, and appointment status.",
        keywords: [
            { term: "hello", weight: 3 },
            { term: "hi", weight: 2 },
            { term: "hey", weight: 2 },
            { term: "good morning", weight: 3 },
            { term: "good evening", weight: 3 },
            { term: "good afternoon", weight: 3 },
        ],
    },
];

const faqIntentMetadata = {
    book_appointment: {
        category: "Appointments",
        quickReplies: ["Show available cardiologists", "How do I pay?", "Can I reschedule?"],
        actions: [
            { label: "Browse Doctors", href: "/doctors" },
            { label: "My Appointments", href: "/appointments" },
        ],
    },
    cancel_appointment: {
        category: "Appointments",
        quickReplies: ["Can I reschedule instead?", "How do I contact support?", "What statuses exist?"],
        actions: [
            { label: "My Appointments", href: "/appointments" },
            { label: "Contact Support", href: "/contact" },
        ],
    },
    reschedule_appointment: {
        category: "Appointments",
        quickReplies: ["Show available doctors", "How do I cancel?", "What does pending mean?"],
        actions: [
            { label: "My Appointments", href: "/appointments" },
            { label: "Browse Doctors", href: "/doctors" },
        ],
    },
    payment_help: {
        category: "Payments",
        quickReplies: ["Show doctor fees", "Show service prices", "Can I pay cash?"],
        actions: [
            { label: "Browse Doctors", href: "/doctors" },
            { label: "Browse Services", href: "/services" },
        ],
    },
    doctor_selection: {
        category: "Doctors",
        quickReplies: ["Recommend a cardiologist", "Show dentists", "Which doctor for skin rash?"],
        actions: [{ label: "Browse Doctors", href: "/doctors" }],
    },
    service_booking: {
        category: "Services",
        quickReplies: ["Show available services", "How much are services?", "Book a lab test"],
        actions: [{ label: "Browse Services", href: "/services" }],
    },
    login_help: {
        category: "Account",
        quickReplies: ["Where is my profile?", "How do I view appointments?", "Contact support"],
        actions: [{ label: "My Appointments", href: "/appointments" }],
    },
    profile_help: {
        category: "Account",
        quickReplies: ["View appointments", "How do I book?", "Contact support"],
        actions: [{ label: "My Profile", href: "/profile" }],
    },
    appointment_status: {
        category: "Appointments",
        quickReplies: ["What does pending mean?", "How do I cancel?", "How do I reschedule?"],
        actions: [{ label: "My Appointments", href: "/appointments" }],
    },
    contact_support: {
        category: "Support",
        quickReplies: ["How do I book?", "How do I cancel?", "Show services"],
        actions: [{ label: "Contact Support", href: "/contact" }],
    },
    greeting: {
        category: "General",
        quickReplies: ["Book an appointment", "Find a doctor", "Show services"],
        actions: [
            { label: "Browse Doctors", href: "/doctors" },
            { label: "Browse Services", href: "/services" },
        ],
    },
    fallback: {
        category: "General",
        quickReplies: ["Book an appointment", "Cancel appointment", "Find a doctor"],
        actions: [
            { label: "Browse Doctors", href: "/doctors" },
            { label: "Contact Support", href: "/contact" },
        ],
    },
    safety: {
        category: "Safety",
        quickReplies: ["Find a doctor", "Contact support", "Book an appointment"],
        actions: [{ label: "Contact Support", href: "/contact" }],
    },
};

const emergencyKeywords = [
    "emergency",
    "urgent",
    "severe chest pain",
    "cant breathe",
    "can't breathe",
    "difficulty breathing",
    "stroke",
    "unconscious",
    "bleeding heavily",
    "suicide",
    "self harm",
];

const dateFormatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
});

const normalizeSpecialization = (value = "") => {
    const normalized = normalizeValue(value);
    return specializationAliases[normalized] || normalized;
};

const valuesMatch = (doctorValue, requestedValue) => {
    const doctorText = normalizeSpecialization(doctorValue);
    const requestedText = normalizeSpecialization(requestedValue);

    if (!doctorText || !requestedText) return false;
    return doctorText === requestedText || doctorText.includes(requestedText) || requestedText.includes(doctorText);
};

const isDoctorAvailable = (availability) => {
    if (availability === true) return true;
    if (availability === false) return false;
    if (availability === undefined || availability === null || availability === "") return false;

    const normalized = normalizeValue(availability);
    return ["available", "yes", "true", "active"].includes(normalized);
};

const parseSchedule = (schedule) => {
    if (!schedule) return {};
    if (typeof schedule === "object" && !Array.isArray(schedule)) return schedule;

    if (typeof schedule === "string") {
        try {
            const parsed = JSON.parse(schedule);
            return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
        } catch {
            return {};
        }
    }

    return {};
};

const parseTimeToMinutes = (timeValue = "") => {
    const raw = String(timeValue).trim();
    const match = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);

    if (!match) return null;

    let hours = Number(match[1]);
    const minutes = Number(match[2] || 0);
    const ampm = (match[3] || "").toLowerCase();

    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    if (ampm === "pm" && hours < 12) hours += 12;
    if (ampm === "am" && hours === 12) hours = 0;

    return hours * 60 + minutes;
};

const slotMatchesTimePeriod = (slot, preferredTimePeriod) => {
    const minutes = parseTimeToMinutes(slot);
    const period = normalizeValue(preferredTimePeriod);

    if (minutes === null || !period) return false;
    if (period === "morning") return minutes < 12 * 60;
    if (period === "afternoon") return minutes >= 12 * 60 && minutes < 17 * 60;
    if (period === "evening") return minutes >= 17 * 60;

    return false;
};

const getScheduleSlots = (schedule, preferredDate) => {
    const parsedSchedule = parseSchedule(schedule);

    if (preferredDate) {
        const dateSlots = parsedSchedule[preferredDate];
        return Array.isArray(dateSlots) ? dateSlots : [];
    }

    return Object.values(parsedSchedule).flatMap((slots) => Array.isArray(slots) ? slots : []);
};

const getDoctorLanguages = (doctor = {}) => {
    const value = doctor.languages ?? doctor.language ?? doctor.raw?.languages ?? doctor.raw?.language;

    if (Array.isArray(value)) return value.map(normalizeValue).filter(Boolean);
    if (typeof value === "string") {
        return value
            .split(/[,/|]/)
            .map(normalizeValue)
            .filter(Boolean);
    }

    return [];
};

const languageMatches = (doctor, preferredLanguage) => {
    const requestedLanguage = normalizeValue(preferredLanguage);
    if (!requestedLanguage) return false;

    return getDoctorLanguages(doctor).some((language) =>
        language === requestedLanguage || language.includes(requestedLanguage) || requestedLanguage.includes(language)
    );
};

const genderMatches = (doctor, genderPreference) => {
    const requestedGender = normalizeValue(genderPreference);
    const doctorGender = normalizeValue(doctor.gender ?? doctor.raw?.gender ?? "");

    if (!requestedGender || !doctorGender) return false;
    return doctorGender === requestedGender;
};

const formatDoctorRecommendation = (doctor, score, reasons) => ({
    id: doctor.id,
    name: doctor.name || "Doctor",
    specialization: doctor.specialization || "",
    fee: doctor.fee ?? doctor.fees ?? 0,
    imageUrl: doctor.image_url || doctor.imageUrl || null,
    availability: doctor.availability ?? "",
    score,
    reasons,
});

const scoreDoctor = (doctor, filters, visitedDoctorIds) => {
    const {
        department,
        preferredLanguage,
        genderPreference,
        preferredDate,
        preferredTimePeriod,
    } = filters;

    let score = 0;
    const reasons = [];

    if (department && valuesMatch(doctor.specialization, department)) {
        score += 5;
        reasons.push("Matches requested department");
    }

    const scheduleSlots = getScheduleSlots(doctor.schedule, preferredDate);

    if (preferredDate && scheduleSlots.length > 0) {
        score += 3;
        reasons.push("Has availability on the preferred date");
    }

    if (preferredTimePeriod && scheduleSlots.some((slot) => slotMatchesTimePeriod(slot, preferredTimePeriod))) {
        score += 2;
        reasons.push(`Has available ${normalizeValue(preferredTimePeriod)} slots`);
    }

    if (preferredLanguage && languageMatches(doctor, preferredLanguage)) {
        score += 2;
        reasons.push("Matches preferred language");
    }

    if (genderPreference && genderMatches(doctor, genderPreference)) {
        score += 2;
        reasons.push("Matches gender preference");
    }

    if (visitedDoctorIds.has(String(doctor.id))) {
        score += 2;
        reasons.push("You have visited this doctor before");
    }

    if (isDoctorAvailable(doctor.availability)) {
        score += 1;
        reasons.push("Doctor is currently marked as available");
    }

    return formatDoctorRecommendation(doctor, score, reasons);
};

const getVisitedDoctorIds = async (patientId) => {
    if (!patientId) return new Set();

    const { data, error } = await supabase
        .from("appointments")
        .select("doctor_id")
        .eq("created_by", patientId);

    if (error) {
        console.warn("Previous appointment lookup failed:", error.message);
        return new Set();
    }

    return new Set((data || []).map((appointment) => String(appointment.doctor_id)));
};

const tokenizeFaqText = (value = "") =>
    normalizeValue(value)
        .split(" ")
        .filter((token) => token.length > 1);

const calculateEditDistance = (a = "", b = "") => {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;

    const previous = Array.from({ length: b.length + 1 }, (_, index) => index);

    for (let i = 1; i <= a.length; i += 1) {
        const current = [i];
        for (let j = 1; j <= b.length; j += 1) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            current[j] = Math.min(
                current[j - 1] + 1,
                previous[j] + 1,
                previous[j - 1] + cost
            );
        }
        previous.splice(0, previous.length, ...current);
    }

    return previous[b.length];
};

const tokensAreSimilar = (a = "", b = "") => {
    if (a === b) return true;
    if (a.length < 4 || b.length < 4) return false;
    if (a.includes(b) || b.includes(a)) {
        const shorterLength = Math.min(a.length, b.length);
        const lengthGap = Math.abs(a.length - b.length);
        return shorterLength >= 5 && lengthGap <= 4;
    }

    const distance = calculateEditDistance(a, b);
    return distance <= (Math.max(a.length, b.length) >= 8 ? 2 : 1);
};

const getKeywordMatch = (normalizedMessage, messageTokens, term, weight = 1) => {
    const normalizedTerm = normalizeSymptoms(term);

    if (containsKeyword(normalizedMessage, normalizedTerm)) {
        return { score: weight, matched: true };
    }

    const termTokens = tokenizeFaqText(normalizedTerm).filter((token) => token.length > 2);
    if (termTokens.length === 0) return { score: 0, matched: false };

    const matchedTokenCount = termTokens.filter((termToken) =>
        messageTokens.some((messageToken) => tokensAreSimilar(messageToken, termToken))
    ).length;

    if (matchedTokenCount === termTokens.length) {
        return { score: Math.max(1, weight * 0.6), matched: true };
    }

    if (termTokens.length > 1 && matchedTokenCount >= Math.ceil(termTokens.length * 0.7)) {
        return { score: Math.max(1, weight * 0.35), matched: true };
    }

    return { score: 0, matched: false };
};

const getTextSearchScore = (messageTokens, value = "") => {
    const haystackTokens = tokenizeFaqText(value);
    if (haystackTokens.length === 0 || messageTokens.length === 0) return 0;

    return messageTokens.reduce((score, token) => {
        if (token.length < 3) return score;
        return haystackTokens.some((candidate) => tokensAreSimilar(token, candidate))
            ? score + 1
            : score;
    }, 0);
};

const getFaqConfigByIntent = (intent) =>
    faqIntentConfigs.find((config) => config.intent === intent) || null;

const getFaqConfidence = (score) => {
    if (!score || score <= 0) return 0.28;
    return Math.min(0.96, Number((0.45 + score / 16).toFixed(2)));
};

const detectFaqIntent = (message) => {
    const normalizedMessage = normalizeSymptoms(message);
    const messageTokens = tokenizeFaqText(message);

    if (emergencyKeywords.some((keyword) => containsKeyword(normalizedMessage, keyword))) {
        return {
            intent: "safety",
            reply:
                "If this is urgent or life-threatening, please call local emergency services or go to the nearest emergency department now. This chat can help with platform guidance, but it cannot handle medical emergencies.",
            matchedKeywords: ["emergency"],
            score: 10,
            confidence: 0.98,
        };
    }

    const bestMatch = faqIntentConfigs
        .map((config, index) => {
            const matchedKeywords = [];
            let score = 0;

            config.keywords.forEach(({ term, weight = 1 }) => {
                const match = getKeywordMatch(normalizedMessage, messageTokens, term, weight);
                if (match.matched) {
                    score += match.score;
                    matchedKeywords.push(term);
                }
            });

            return {
                ...config,
                score,
                matchedKeywords: Array.from(new Set(matchedKeywords)),
                order: index,
            };
        })
        .sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return a.order - b.order;
        })[0];

    if (!bestMatch || bestMatch.score <= 0) {
        return {
            intent: "fallback",
            reply: FAQ_FALLBACK_REPLY,
            matchedKeywords: [],
            score: 0,
            confidence: getFaqConfidence(0),
        };
    }

    return {
        intent: bestMatch.intent,
        reply: bestMatch.reply,
        matchedKeywords: bestMatch.matchedKeywords,
        score: bestMatch.score,
        confidence: getFaqConfidence(bestMatch.score),
    };
};

const resolveContextualIntent = (message, detectedIntent, history = []) => {
    if (detectedIntent.intent !== "fallback") return detectedIntent;

    const normalizedMessage = normalizeValue(message);
    const isShortFollowUp = [
        "yes",
        "yeah",
        "show me",
        "show",
        "more",
        "details",
        "book",
        "how",
        "where",
        "ok",
    ].includes(normalizedMessage);

    if (!isShortFollowUp || !Array.isArray(history)) return detectedIntent;

    const previousIntent = [...history]
        .reverse()
        .find((item) =>
            item?.role === "bot" &&
            item?.intent &&
            !["fallback", "greeting", "safety"].includes(item.intent)
        )?.intent;

    const previousConfig = getFaqConfigByIntent(previousIntent);
    if (!previousConfig) return detectedIntent;

    return {
        ...detectedIntent,
        intent: previousIntent,
        reply: previousConfig.reply,
        matchedKeywords: ["follow-up"],
        score: 1,
        confidence: 0.52,
    };
};

const formatMoney = (value) => {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0) return "Fee not listed";
    return `$${amount}`;
};

const getTodayString = (date = new Date()) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
};

const formatDateLabel = (dateStr) => {
    if (!dateStr || dateStr === "unspecified") return "Date not listed";

    const today = getTodayString();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowString = getTodayString(tomorrow);

    if (dateStr === today) return "Today";
    if (dateStr === tomorrowString) return "Tomorrow";

    const parsedDate = new Date(`${dateStr}T00:00:00`);
    return Number.isNaN(parsedDate.getTime()) ? dateStr : dateFormatter.format(parsedDate);
};

const getNextAvailableSlot = (schedule) => {
    const parsedSchedule = parseSchedule(schedule);
    const now = new Date();
    const today = getTodayString(now);
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    return Object.entries(parsedSchedule)
        .flatMap(([dateStr, slots]) =>
            (Array.isArray(slots) ? slots : []).map((slot) => ({
                dateStr,
                time: String(slot),
                minutes: parseTimeToMinutes(slot),
            }))
        )
        .filter((slot) => {
            if (!slot.dateStr || slot.dateStr === "unspecified") return true;
            if (slot.dateStr < today) return false;
            if (slot.dateStr === today && slot.minutes !== null && slot.minutes <= nowMinutes) return false;
            return true;
        })
        .sort((a, b) => {
            if (a.dateStr !== b.dateStr) return a.dateStr.localeCompare(b.dateStr);
            return (a.minutes ?? 0) - (b.minutes ?? 0);
        })[0] || null;
};

const formatNextSlotLabel = (slot) =>
    slot ? `${formatDateLabel(slot.dateStr)} at ${slot.time}` : "No upcoming slot listed";

const getAvailabilityLabel = (value) => {
    if (value === true) return "Available";
    if (value === false) return "Unavailable";

    const normalized = normalizeValue(value);
    if (!normalized) return "Availability not listed";
    if (["available", "yes", "true", "active"].includes(normalized)) return "Available";
    if (["unavailable", "no", "false", "inactive"].includes(normalized)) return "Unavailable";

    return String(value);
};

const fetchFaqContext = async () => {
    const [doctorResult, serviceResult] = await Promise.all([
        supabase
            .from("doctors")
            .select("id, name, specialization, fee, availability, schedule, rating, experience, location, about")
            .order("name", { ascending: true }),
        supabase
            .from("services")
            .select("id, name, short_description, about, price, available, slots, instructions")
            .order("name", { ascending: true }),
    ]);

    if (doctorResult.error) {
        console.warn("FAQ doctor context lookup failed:", doctorResult.error.message);
    }

    if (serviceResult.error) {
        console.warn("FAQ service context lookup failed:", serviceResult.error.message);
    }

    return {
        doctors: doctorResult.error ? [] : (doctorResult.data || []),
        services: serviceResult.error ? [] : (serviceResult.data || []),
    };
};

const getRequestedSpecializations = (message, doctors = []) => {
    const normalizedMessage = normalizeSymptoms(message);
    const requested = new Set();

    Object.entries(specializationAliases).forEach(([alias, canonical]) => {
        if (containsKeyword(normalizedMessage, alias)) requested.add(canonical);
    });

    Object.keys(departmentKeywordMap).forEach((department) => {
        const normalizedDepartment = normalizeSpecialization(department);
        if (
            containsKeyword(normalizedMessage, department) ||
            containsKeyword(normalizedMessage, normalizedDepartment)
        ) {
            requested.add(normalizedDepartment);
        }
    });

    doctors.forEach((doctor) => {
        const specialization = doctor.specialization || "";
        const normalizedSpecialization = normalizeSpecialization(specialization);
        if (
            specialization &&
            (
                containsKeyword(normalizedMessage, specialization) ||
                containsKeyword(normalizedMessage, normalizedSpecialization)
            )
        ) {
            requested.add(normalizedSpecialization);
        }
    });

    getDepartmentSuggestions(normalizedMessage).forEach((suggestion) => {
        if (suggestion.score > 0) {
            requested.add(normalizeSpecialization(suggestion.department));
        }
    });

    return Array.from(requested);
};

const scoreDoctorForFaq = (doctor, message, requestedSpecializations = [], allowGeneric = false) => {
    const normalizedMessage = normalizeSymptoms(message);
    const messageTokens = tokenizeFaqText(message);
    const doctorSearchText = [
        doctor.name,
        doctor.specialization,
        doctor.location,
        doctor.experience,
        doctor.about,
    ].filter(Boolean).join(" ");
    let score = getTextSearchScore(messageTokens, doctorSearchText);
    const reasons = [];

    if (doctor.name && containsKeyword(normalizedMessage, doctor.name)) {
        score += 8;
        reasons.push("Name match");
    }

    requestedSpecializations.forEach((specialization) => {
        if (valuesMatch(doctor.specialization, specialization)) {
            score += 10;
            reasons.push(`Matches ${doctor.specialization}`);
        }
    });

    if (isDoctorAvailable(doctor.availability)) {
        score += allowGeneric ? 2 : 1;
        reasons.push("Available");
    }

    if (allowGeneric && score <= 2) {
        score += 1;
    }

    return { doctor, score, reasons };
};

const scoreServiceForFaq = (service, message, allowGeneric = false) => {
    const messageTokens = tokenizeFaqText(message);
    const serviceSearchText = [
        service.name,
        service.short_description,
        service.about,
        Array.isArray(service.instructions) ? service.instructions.join(" ") : "",
    ].filter(Boolean).join(" ");
    let score = getTextSearchScore(messageTokens, serviceSearchText);

    if (service.name && containsKeyword(normalizeSymptoms(message), service.name)) {
        score += 8;
    }

    if (service.available === true) {
        score += allowGeneric ? 2 : 1;
    }

    if (allowGeneric && score <= 2) {
        score += 1;
    }

    return { service, score };
};

const getDoctorCards = (doctorMatches = []) =>
    doctorMatches.slice(0, 3).map(({ doctor }) => {
        const nextSlot = getNextAvailableSlot(doctor.schedule);

        return {
            type: "doctor",
            title: doctor.name || "Doctor",
            subtitle: doctor.specialization || "Specialist",
            href: `/doctors/${doctor.id}`,
            badges: [getAvailabilityLabel(doctor.availability), formatMoney(doctor.fee)],
            details: [
                doctor.rating ? `Rating ${doctor.rating}/5` : "",
                doctor.location || "",
                formatNextSlotLabel(nextSlot),
            ].filter(Boolean),
        };
    });

const getServiceCards = (serviceMatches = []) =>
    serviceMatches.slice(0, 3).map(({ service }) => {
        const nextSlot = getNextAvailableSlot(service.slots);

        return {
            type: "service",
            title: service.name || "Service",
            subtitle: service.short_description || "Medical service",
            href: `/services/${service.id}`,
            badges: [
                service.available ? "Available" : "Unavailable",
                formatMoney(service.price),
            ],
            details: [
                formatNextSlotLabel(nextSlot),
                Array.isArray(service.instructions) && service.instructions[0]
                    ? service.instructions[0]
                    : "",
            ].filter(Boolean),
        };
    });

const formatDoctorLine = ({ doctor }) => {
    const nextSlot = getNextAvailableSlot(doctor.schedule);
    return `${doctor.name || "Doctor"} (${doctor.specialization || "Specialist"}) - ${formatMoney(doctor.fee)}, ${getAvailabilityLabel(doctor.availability)}, next slot: ${formatNextSlotLabel(nextSlot)}.`;
};

const formatServiceLine = ({ service }) => {
    const nextSlot = getNextAvailableSlot(service.slots);
    return `${service.name || "Service"} - ${formatMoney(service.price)}, ${service.available ? "available" : "currently unavailable"}, next slot: ${formatNextSlotLabel(nextSlot)}.`;
};

const dedupeActions = (actions = []) => {
    const seen = new Set();
    return actions.filter((action) => {
        if (!action?.href || seen.has(action.href)) return false;
        seen.add(action.href);
        return true;
    });
};

const mergeQuickReplies = (...groups) => {
    const seen = new Set();
    return groups
        .flat()
        .filter(Boolean)
        .filter((reply) => {
            const key = normalizeValue(reply);
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .slice(0, 5);
};

const getFaqResponse = async (input, detectedIntent, history = []) => {
    const resolvedIntent = resolveContextualIntent(input, detectedIntent, history);
    const metadata = faqIntentMetadata[resolvedIntent.intent] || faqIntentMetadata.fallback;

    if (resolvedIntent.intent === "safety") {
        return {
            ...resolvedIntent,
            category: metadata.category,
            reply: resolvedIntent.reply,
            quickReplies: metadata.quickReplies,
            actions: metadata.actions,
            cards: [],
        };
    }

    const context = await fetchFaqContext();
    const { doctors, services } = context;
    const requestedSpecializations = getRequestedSpecializations(input, doctors);
    const normalizedInput = normalizeSymptoms(input);
    const mentionsDoctor = ["doctor", "doctors", "specialist", "specialists", "consultation"].some((term) =>
        containsKeyword(normalizedInput, term)
    );
    const mentionsService = ["service", "services", "lab", "test", "scan", "x ray", "mri"].some((term) =>
        containsKeyword(normalizedInput, term)
    );
    const asksPrice = ["fee", "fees", "price", "prices", "cost", "how much"].some((term) =>
        containsKeyword(normalizedInput, term)
    );
    const isDoctorIntent = ["doctor_selection", "book_appointment", "payment_help", "fallback", "greeting"].includes(resolvedIntent.intent);
    const isServiceIntent = ["service_booking", "payment_help", "fallback", "greeting"].includes(resolvedIntent.intent);
    const allowGenericDoctors =
        ["doctor_selection", "book_appointment", "greeting"].includes(resolvedIntent.intent) ||
        (resolvedIntent.intent === "payment_help" && asksPrice && !mentionsService);
    const allowGenericServices =
        ["service_booking", "greeting"].includes(resolvedIntent.intent) ||
        (resolvedIntent.intent === "payment_help" && asksPrice && !mentionsDoctor);

    const doctorMatches = isDoctorIntent
        ? doctors
            .map((doctor) => scoreDoctorForFaq(doctor, input, requestedSpecializations, allowGenericDoctors))
            .filter((match) => match.score >= (allowGenericDoctors ? 2 : 3))
            .sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                return String(a.doctor.name || "").localeCompare(String(b.doctor.name || ""));
            })
            .slice(0, 4)
        : [];

    const serviceMatches = isServiceIntent
        ? services
            .map((service) => scoreServiceForFaq(service, input, allowGenericServices))
            .filter((match) => match.score >= (allowGenericServices ? 2 : 3))
            .sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                return String(a.service.name || "").localeCompare(String(b.service.name || ""));
            })
            .slice(0, 4)
        : [];

    let responseIntent = resolvedIntent.intent;
    if (resolvedIntent.intent === "fallback" && doctorMatches.length > 0 && serviceMatches.length === 0) {
        responseIntent = "doctor_selection";
    } else if (resolvedIntent.intent === "fallback" && serviceMatches.length > 0 && doctorMatches.length === 0) {
        responseIntent = "service_booking";
    }

    const responseMetadata = faqIntentMetadata[responseIntent] || metadata;

    const cards = [
        ...getDoctorCards(doctorMatches),
        ...getServiceCards(serviceMatches),
    ].slice(0, 4);

    const dynamicParts = [];
    const actions = [...(responseMetadata.actions || [])];
    const dynamicReplies = [];

    if (resolvedIntent.intent === "greeting" && (doctors.length || services.length)) {
        const specializations = new Set(doctors.map((doctor) => doctor.specialization).filter(Boolean));
        dynamicParts.push(
            `Current platform context: ${doctors.length} doctors across ${specializations.size} specializations and ${services.length} services.`
        );
    }

    if (doctorMatches.length > 0) {
        const specializationText = requestedSpecializations.length
            ? `For ${requestedSpecializations.join(", ")}`
            : "From the current doctor list";
        dynamicParts.push(`${specializationText}, I found: ${doctorMatches.slice(0, 3).map(formatDoctorLine).join(" ")}`);
        actions.push({ label: "Open Doctors", href: "/doctors" });
        dynamicReplies.push("Show more doctors", "How do I book one?");
    }

    if (serviceMatches.length > 0) {
        dynamicParts.push(`From the current service list, I found: ${serviceMatches.slice(0, 3).map(formatServiceLine).join(" ")}`);
        actions.push({ label: "Open Services", href: "/services" });
        dynamicReplies.push("Show service prices", "How do I book a service?");
    }

    if (resolvedIntent.intent === "appointment_status") {
        dynamicParts.push("I cannot open private appointment details inside this public chat, but the Appointments page shows your latest doctor and service bookings after you sign in.");
    }

    if (resolvedIntent.intent === "fallback" && dynamicParts.length > 0) {
        resolvedIntent.reply = "I found a few relevant matches from the platform database.";
        resolvedIntent.confidence = Math.max(resolvedIntent.confidence, 0.62);
    }

    const reply = [resolvedIntent.reply, ...dynamicParts].filter(Boolean).join("\n\n");

    return {
        ...resolvedIntent,
        intent: responseIntent,
        category: responseMetadata.category,
        reply,
        quickReplies: mergeQuickReplies(dynamicReplies, responseMetadata.quickReplies),
        actions: dedupeActions(actions),
        cards,
        databaseContext: {
            doctorsChecked: doctors.length,
            servicesChecked: services.length,
            doctorMatches: doctorMatches.length,
            serviceMatches: serviceMatches.length,
        },
    };
};

export const checkSymptoms = (req, res) => {
    try {
        const { symptoms } = req.body || {};

        if (typeof symptoms !== "string" || symptoms.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: "Please enter your symptoms before requesting a suggestion.",
            });
        }

        const input = symptoms.trim();
        const normalizedInput = normalizeSymptoms(input);
        const suggestions = getDepartmentSuggestions(normalizedInput);
        const topSuggestion = suggestions[0] || null;

        const message = topSuggestion
            ? `Based on your symptoms, ${topSuggestion.department} may be the most suitable department.`
            : LOW_CONFIDENCE_MESSAGE;

        return res.json({
            success: true,
            input,
            suggestions,
            topSuggestion,
            message,
        });
    } catch (error) {
        console.error("Symptom suggestion error:", error);
        return res.status(500).json({
            success: false,
            message: "An error occurred while checking symptoms.",
        });
    }
};

export const recommendDoctors = async (req, res) => {
    try {
        const {
            department = "",
            preferredLanguage = "",
            genderPreference = "",
            preferredDate = "",
            preferredTimePeriod = "",
            patientId = "",
        } = req.body || {};

        if (!String(department).trim()) {
            return res.status(400).json({
                success: false,
                message: "Please choose a department before requesting doctor recommendations.",
            });
        }

        const filters = {
            department: String(department).trim(),
            preferredLanguage: String(preferredLanguage || "").trim(),
            genderPreference: String(genderPreference || "").trim(),
            preferredDate: String(preferredDate || "").trim(),
            preferredTimePeriod: String(preferredTimePeriod || "").trim(),
        };

        const { data: doctors, error } = await supabase
            .from("doctors")
            .select("*")
            .order("name", { ascending: true });

        if (error) {
            console.error("Doctor recommendation lookup error:", error);
            return res.status(500).json({
                success: false,
                message: "An error occurred while fetching doctors.",
            });
        }

        const visitedDoctorIds = await getVisitedDoctorIds(String(patientId || "").trim());

        const scoredDoctors = (doctors || [])
            .map((doctor) => scoreDoctor(doctor, filters, visitedDoctorIds))
            .sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                return a.name.localeCompare(b.name);
            });

        const positiveMatches = scoredDoctors.filter((doctor) => doctor.score > 0);
        const recommendations = (positiveMatches.length > 0 ? positiveMatches : scoredDoctors).slice(0, 5);
        const hasStrongMatch = recommendations.some((doctor) => doctor.score >= 5);

        return res.json({
            success: true,
            filters,
            recommendations,
            message: hasStrongMatch
                ? "Here are the best doctor matches based on your preferences."
                : NO_RECOMMENDATION_MESSAGE,
        });
    } catch (error) {
        console.error("Doctor recommendation error:", error);
        return res.status(500).json({
            success: false,
            message: "An error occurred while recommending doctors.",
        });
    }
};

export const faqChat = async (req, res) => {
    try {
        const { message, history = [] } = req.body || {};

        if (typeof message !== "string" || message.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: "Please enter a message before sending it to the FAQ chatbot.",
            });
        }

        const input = message.trim();
        const detectedIntent = detectFaqIntent(input);
        const safeHistory = Array.isArray(history)
            ? history
                .slice(-8)
                .map((item) => ({
                    role: item?.role === "bot" ? "bot" : "user",
                    text: String(item?.text || "").slice(0, 500),
                    intent: String(item?.intent || ""),
                }))
            : [];
        const result = await getFaqResponse(input, detectedIntent, safeHistory);

        return res.json({
            success: true,
            intent: result.intent,
            category: result.category,
            reply: result.reply,
            matchedKeywords: result.matchedKeywords,
            confidence: result.confidence,
            quickReplies: result.quickReplies,
            actions: result.actions,
            cards: result.cards,
            databaseContext: result.databaseContext,
        });
    } catch (error) {
        console.error("FAQ chatbot error:", error);
        return res.status(500).json({
            success: false,
            message: "An error occurred while processing the FAQ chatbot request.",
        });
    }
};

export default {
    checkSymptoms,
    recommendDoctors,
    faqChat,
};
