import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useClerk, SignedOut, SignedIn } from '@clerk/clerk-react'
import {
  Shield, Calendar, Heart, Clock,
  Search, CalendarDays, CheckCircle,
  Star, Phone,
} from 'lucide-react'

import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import DoctorsPreview from '../components/DoctorsPreview'
import ServicesPreview from '../components/ServicesPreview'
import { homePageStyles as hs } from '../assets/dummyStyles'

import BannerImg from '../assets/BannerImg.jpg'
import C1 from '../assets/C1.jpeg'
import C2 from '../assets/C2.jpeg'
import C3 from '../assets/C3.png'
import C4 from '../assets/C4.jpeg'
import C5 from '../assets/C5.png'

// ── Static data ────────────────────────────────────────────────────────────────

const benefits = [
  {
    icon: Shield,
    color: 'bg-emerald-100',
    iconColor: 'text-emerald-600',
    title: 'Expert Doctors',
    text: 'Every physician is board-certified and thoroughly vetted for your safety and peace of mind.',
  },
  {
    icon: Calendar,
    color: 'bg-teal-100',
    iconColor: 'text-teal-600',
    title: 'Easy Booking',
    text: 'Book, reschedule, or cancel appointments in seconds — no phone calls or waiting rooms.',
  },
  {
    icon: Heart,
    color: 'bg-rose-100',
    iconColor: 'text-rose-500',
    title: 'Affordable Care',
    text: 'Transparent pricing with no hidden fees. Quality healthcare that fits your budget.',
  },
  {
    icon: Clock,
    color: 'bg-blue-100',
    iconColor: 'text-blue-600',
    title: '24 / 7 Support',
    text: 'Our care team is available around the clock to assist with urgent questions and follow-ups.',
  },
]

const steps = [
  {
    step: '1',
    icon: Search,
    title: 'Find a Doctor or Service',
    text: 'Browse our directory of specialists and services filtered by specialty, availability, and fee.',
  },
  {
    step: '2',
    icon: CalendarDays,
    title: 'Book Your Appointment',
    text: 'Select a convenient date and time slot, fill in your details, and confirm in one click.',
  },
  {
    step: '3',
    icon: CheckCircle,
    title: 'Receive Expert Care',
    text: 'Meet your doctor, get a diagnosis, and leave with a clear, personalised treatment plan.',
  },
]

const testimonials = [
  {
    id: 1,
    name: 'Sarah Johnson',
    role: 'Regular Patient',
    quote:
      '"Booking my appointment was incredibly easy. The doctor was attentive and professional — I felt heard and cared for throughout."',
    rating: 5,
    avatar: C1,
  },
  {
    id: 2,
    name: 'Michael Chen',
    role: 'First-time Patient',
    quote:
      '"I was nervous about seeing a new specialist, but the platform made it seamless. Transparent fees, no surprises. Highly recommend!"',
    rating: 5,
    avatar: C2,
  },
  {
    id: 3,
    name: 'Emily Rodriguez',
    role: 'Returning Patient',
    quote:
      '"The 24/7 support team helped me reschedule last-minute without any hassle. This is what modern healthcare should feel like."',
    rating: 5,
    avatar: C3,
  },
  {
    id: 4,
    name: 'David Kim',
    role: 'Patient',
    quote:
      '"Found an excellent cardiologist within minutes. The whole experience — from search to consultation — was outstanding."',
    rating: 4,
    avatar: C4,
  },
  {
    id: 5,
    name: 'Aisha Patel',
    role: 'Patient',
    quote:
      '"Affordable pricing, expert doctors, and a clean interface. I\'ve recommended HealthCare Appointments to my entire family."',
    rating: 5,
    avatar: C5,
  },
  {
    id: 6,
    name: 'James Wilson',
    role: 'Senior Patient',
    quote:
      '"My follow-up was scheduled automatically and the reminder system is fantastic. Makes managing my health so much simpler."',
    rating: 5,
    avatar: C1,
  },
]

// ── Sub-components ─────────────────────────────────────────────────────────────

const StarRating = ({ rating }) => (
  <div className={hs.testimonialStars}>
    {Array.from({ length: 5 }).map((_, i) => (
      <Star
        key={i}
        className={
          i < rating ? hs.testimonialStar : hs.testimonialStarEmpty
        }
      />
    ))}
  </div>
)

// ── Next-available helpers ──────────────────────────────────────────────────────

const API_BASE = 'http://localhost:4000'

const parseTimeToMinutes = (t = '') => {
  const [time = '0:00', ampm = ''] = (t || '').trim().split(' ')
  const [hh = '0', mm = '0'] = time.split(':')
  let h = parseInt(hh, 10) % 12
  if (ampm.toUpperCase() === 'PM') h += 12
  return h * 60 + parseInt(mm || '0', 10)
}

const getLocalDateStr = (date = new Date()) => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const computeNextAvailable = (doctors = []) => {
  const now = new Date()
  const todayStr = getLocalDateStr(now)
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  let best = null // { dateStr, time, minutes }

  doctors.forEach((doc) => {
    const schedule = doc.schedule || {}
    Object.entries(schedule).forEach(([dateStr, slots]) => {
      if (!Array.isArray(slots) || slots.length === 0) return
      if (dateStr < todayStr) return // past date

      slots.forEach((slot) => {
        const slotMins = parseTimeToMinutes(slot)
        if (dateStr === todayStr && slotMins <= nowMinutes) return // past time today

        if (
          !best ||
          dateStr < best.dateStr ||
          (dateStr === best.dateStr && slotMins < best.minutes)
        ) {
          best = { dateStr, time: slot, minutes: slotMins }
        }
      })
    })
  })

  return best
}

const formatNextAvailable = (slot) => {
  if (!slot) return 'No slots available'
  const todayStr = getLocalDateStr()
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = getLocalDateStr(tomorrow)

  let dateLabel
  if (slot.dateStr === todayStr) dateLabel = 'Today'
  else if (slot.dateStr === tomorrowStr) dateLabel = 'Tomorrow'
  else {
    const d = new Date(slot.dateStr + 'T00:00:00')
    dateLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return `${dateLabel} · ${slot.time}`
}

// ── Main component ─────────────────────────────────────────────────────────────

const Home = () => {
  const clerk = useClerk()
  const [nextAvailableText, setNextAvailableText] = useState('Loading…')
  const [doctorCount, setDoctorCount] = useState(null)
  const [specialtyCount, setSpecialtyCount] = useState(null)

  useEffect(() => {
    fetch(`${API_BASE}/api/doctors?limit=500`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success && Array.isArray(json.data)) {
          const slot = computeNextAvailable(json.data)
          setNextAvailableText(formatNextAvailable(slot))

          // Real counts from backend
          setDoctorCount(json.meta?.total ?? json.data.length)
          const uniqueSpecialties = new Set(
            json.data.map((d) => (d.specialization || '').trim().toLowerCase()).filter(Boolean)
          )
          setSpecialtyCount(uniqueSpecialties.size)
        }
      })
      .catch(() => setNextAvailableText('Unavailable'))
  }, [])

  return (
    <div className="min-h-screen">
      <Navbar />

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <section className={hs.heroSection}>
        <div className={hs.heroBg1} aria-hidden="true" />
        <div className={hs.heroBg2} aria-hidden="true" />

        <div className={hs.heroContainer}>
          <div className={hs.heroGrid}>

            {/* Left: copy */}
            <div className={hs.heroLeft}>
              <div className={hs.heroBadge}>
                <span className={hs.heroBadgeDot} />
                Trusted by 10,000+ patients
              </div>

              <h1 className={hs.heroTitle}>
                Your Health,{' '}
                <span className={hs.heroTitleGradient}>
                  Our Priority
                </span>
              </h1>

              <p className={hs.heroSubtitle}>
                Connect with certified specialists, book appointments instantly,
                and take control of your healthcare journey — all in one place.
              </p>

              <div className={hs.heroButtons}>
                <SignedOut>
                  <button
                    onClick={() => clerk.openSignIn()}
                    className={hs.heroPrimaryBtn}
                  >
                    <CalendarDays className="w-5 h-5" />
                    Book Appointment
                  </button>
                </SignedOut>
                <SignedIn>
                  <Link to="/appointments" className={hs.heroPrimaryBtn}>
                    <CalendarDays className="w-5 h-5" />
                    My Appointments
                  </Link>
                </SignedIn>

                <Link to="/doctors" className={hs.heroSecondaryBtn}>
                  <Search className="w-5 h-5" />
                  Find a Doctor
                </Link>
              </div>

              {/* Stats */}
              <div className={hs.heroStats}>
                {[
                  { value: doctorCount !== null ? String(doctorCount) : '…', label: 'Doctors' },
                  { value: '10K+', label: 'Patients' },
                  { value: specialtyCount !== null ? String(specialtyCount) : '…', label: 'Specialties' },
                ].map(({ value, label }) => (
                  <div key={label} className={hs.heroStatItem}>
                    <div className={hs.heroStatValue}>{value}</div>
                    <div className={hs.heroStatLabel}>{label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: image with floating cards */}
            <div className={hs.heroRight}>
              <div className={hs.heroImageWrapper}>
                <img
                  src={BannerImg}
                  alt="Healthcare professionals"
                  className={hs.heroImage}
                />
                <div className={hs.heroImageOverlay} />
              </div>

              {/* Floating card: availability */}
              <div className={hs.heroCard1}>
                <div className={hs.heroCardIcon}>
                  <CalendarDays className={hs.heroCardLucide} />
                </div>
                <div>
                  <p className={hs.heroCardText}>Next Available</p>
                  <p className={hs.heroCardSub}>{nextAvailableText}</p>
                </div>
              </div>

              {/* Floating card: rating */}
              <div className={hs.heroCard2}>
                <p className={hs.heroCardText}>⭐ 4.9 / 5</p>
                <p className={hs.heroCardSub}>Patient Rating</p>
              </div>
            </div>

          </div>
        </div>

        <style>{hs.animationStyles}</style>
      </section>

      {/* ── Benefits / Trust ────────────────────────────────────────────── */}
      <section className={hs.benefitsSection}>
        <div className={hs.benefitsContainer}>
          <div className={hs.benefitsHeader}>
            <h2 className={hs.benefitsTitle}>
              Why Choose{' '}
              <span className={hs.benefitsTitleSpan}>HealthCare?</span>
            </h2>
            <p className={hs.benefitsSubtitle}>
              We are committed to making quality healthcare accessible,
              affordable, and stress-free for every patient.
            </p>
          </div>

          <div className={hs.benefitsGrid}>
            {benefits.map(({ icon: Icon, color, iconColor, title, text }) => (
              <div key={title} className={hs.benefitCard}>
                <div className={`${hs.benefitIconWrapper} ${color}`}>
                  <Icon className={`${hs.benefitIcon} ${iconColor}`} />
                </div>
                <h3 className={hs.benefitTitle}>{title}</h3>
                <p className={hs.benefitText}>{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Doctors Preview ─────────────────────────────────────────────── */}
      <DoctorsPreview />

      {/* ── Services Preview ────────────────────────────────────────────── */}
      <ServicesPreview />

      {/* ── How It Works ────────────────────────────────────────────────── */}
      <section className={hs.howSection}>
        <div className={hs.howContainer}>
          <div className={hs.howHeader}>
            <h2 className={hs.sectionTitle}>
              How It{' '}
              <span className={hs.sectionTitleSpan}>Works</span>
            </h2>
            <p className={hs.sectionSubtitle}>
              Getting expert medical care has never been simpler. Three steps
              stand between you and better health.
            </p>
          </div>

          <div className={hs.howGrid}>
            {steps.map(({ step, icon: Icon, title, text }, idx) => (
              <div key={step} className={hs.howCardWrapper}>
                <div className={hs.howCard}>
                  <span className={hs.howStepNumber}>{step}</span>
                  <div className={hs.howIconWrapper}>
                    <Icon className={hs.howIcon} />
                  </div>
                  <h3 className={hs.howStepTitle}>{title}</h3>
                  <p className={hs.howStepText}>{text}</p>
                </div>
                {/* Connector between cards */}
                {idx < steps.length - 1 && (
                  <span className={hs.howConnector} aria-hidden="true" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials ────────────────────────────────────────────────── */}
      <section className={hs.testimonialsSection}>
        <div className={hs.testimonialsContainer}>
          <div className={hs.testimonialsHeader}>
            <h2 className={hs.sectionTitle}>
              What Our{' '}
              <span className={hs.sectionTitleSpan}>Patients Say</span>
            </h2>
            <p className={hs.sectionSubtitle}>
              Thousands of patients trust us every day. Here is what a few of
              them have to say about their experience.
            </p>
          </div>

          <div className={hs.testimonialsGrid}>
            {testimonials.map((t) => (
              <div key={t.id} className={hs.testimonialCard}>
                <StarRating rating={t.rating} />
                <p className={hs.testimonialQuote}>{t.quote}</p>
                <div className={hs.testimonialAuthor}>
                  <img
                    src={t.avatar}
                    alt={t.name}
                    className={hs.testimonialAvatar}
                    onError={(e) => {
                      e.currentTarget.style.display = 'none'
                    }}
                  />
                  <div>
                    <p className={hs.testimonialName}>{t.name}</p>
                    <p className={hs.testimonialRole}>{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ───────────────────────────────────────────────────── */}
      <section className={hs.ctaSection}>
        <div className={hs.ctaBg1} aria-hidden="true" />
        <div className={hs.ctaBg2} aria-hidden="true" />

        <div className={hs.ctaContainer}>
          <h2 className={hs.ctaTitle}>
            Ready to Take Control of Your Health?
          </h2>
          <p className={hs.ctaSubtitle}>
            Join thousands of patients who manage their healthcare online.
            Book your first appointment today — it only takes a minute.
          </p>

          <div className={hs.ctaButtons}>
            <SignedOut>
              <button
                onClick={() => clerk.openSignIn()}
                className={hs.ctaPrimaryBtn}
              >
                <CalendarDays className="w-5 h-5" />
                Book Appointment
              </button>
            </SignedOut>
            <SignedIn>
              <Link to="/appointments" className={hs.ctaPrimaryBtn}>
                <CalendarDays className="w-5 h-5" />
                My Appointments
              </Link>
            </SignedIn>

            <a href="tel:+96176944185" className={hs.ctaSecondaryBtn}>
              <Phone className="w-5 h-5" />
              Call Us Now
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <Footer />
    </div>
  )
}

export default Home
