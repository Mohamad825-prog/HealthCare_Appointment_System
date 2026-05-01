import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { SignedIn, SignedOut, useClerk } from '@clerk/clerk-react'
import {
  CalendarDays,
  Clock3,
  Headphones,
  Mail,
  MapPin,
  MessageSquareMore,
  Phone,
  Send,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react'

import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import { homePageStyles as hs } from '../assets/dummyStyles'

const API_BASE = 'http://localhost:4000'

const initialForm = {
  name: '',
  email: '',
  phone: '',
  subject: '',
  message: '',
}

const contactCards = [
  {
    title: 'Call Our Clinic',
    text: 'Speak with our support team for appointment help, service questions, and general guidance.',
    value: '+961 76 944 185',
    href: 'tel:+96176944185',
    icon: Phone,
  },
  {
    title: 'Email Support',
    text: 'Send non-urgent questions and we will follow up with the right department as soon as possible.',
    value: 'contact@healthcare.com',
    href: 'mailto:contact@healthcare.com',
    icon: Mail,
  },
  {
    title: 'Visit the Clinic',
    text: 'Find us in Saida for in-person assistance, appointment coordination, and front-desk support.',
    value: 'Saida, Lebanon',
    href: 'https://maps.google.com/?q=Saida,Lebanon',
    icon: MapPin,
  },
]

const faqItems = [
  {
    question: 'How quickly will I receive a response?',
    answer:
      'For routine support requests, our team aims to respond during clinic hours on the same day whenever possible.',
  },
  {
    question: 'Can I use this page to change an appointment?',
    answer:
      'Use this page for general support questions. For direct appointment actions, please visit the Appointments page after signing in.',
  },
  {
    question: 'Should I use this form for urgent medical issues?',
    answer:
      'No. If you are experiencing a medical emergency, call your local emergency service immediately or go to the nearest emergency department.',
  },
]

const isEmailValid = (value) => /\S+@\S+\.\S+/.test(value)
const isPhoneValid = (value) => /^[0-9+\s()-]{7,20}$/.test(value)

const validateForm = (form) => {
  const nextErrors = {}

  if (!form.name.trim()) nextErrors.name = 'Please enter your full name.'
  if (!form.email.trim()) nextErrors.email = 'Please enter your email address.'
  else if (!isEmailValid(form.email.trim())) {
    nextErrors.email = 'Please enter a valid email address.'
  }

  if (!form.phone.trim()) nextErrors.phone = 'Please enter your phone number.'
  else if (!isPhoneValid(form.phone.trim())) {
    nextErrors.phone = 'Please enter a valid phone number.'
  }

  if (!form.subject.trim()) nextErrors.subject = 'Please enter a subject.'
  else if (form.subject.trim().length < 3) {
    nextErrors.subject = 'Subject must be at least 3 characters.'
  }

  if (!form.message.trim()) nextErrors.message = 'Please enter your message.'
  else if (form.message.trim().length < 20) {
    nextErrors.message = 'Message must be at least 20 characters.'
  }

  return nextErrors
}

const InfoCard = ({ icon: Icon, title, text, value, href }) => (
  <a
    href={href}
    target={href.startsWith('https://') ? '_blank' : undefined}
    rel={href.startsWith('https://') ? 'noreferrer' : undefined}
    className="group rounded-3xl border border-emerald-100 bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
  >
    <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
      <Icon className="h-6 w-6" />
    </div>
    <h3 className="text-lg font-bold text-gray-900">{title}</h3>
    <p className="mt-2 text-sm leading-relaxed text-gray-500">{text}</p>
    <p className="mt-4 font-semibold text-emerald-700 transition-colors duration-300 group-hover:text-emerald-800">
      {value}
    </p>
  </a>
)

const FieldError = ({ message }) =>
  message ? <p className="mt-2 text-sm text-rose-600">{message}</p> : null

const Contact = () => {
  const clerk = useClerk()

  const [form, setForm] = useState(initialForm)
  const [errors, setErrors] = useState({})
  const [submitError, setSubmitError] = useState('')
  const [submitSuccess, setSubmitSuccess] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleChange = (field) => (event) => {
    const value = event.target.value

    setForm((current) => ({ ...current, [field]: value }))
    setErrors((current) => {
      if (!current[field]) return current
      const nextErrors = { ...current }
      delete nextErrors[field]
      return nextErrors
    })
    setSubmitError('')
    setSubmitSuccess('')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    const nextErrors = validateForm(form)
    setErrors(nextErrors)
    setSubmitError('')
    setSubmitSuccess('')

    if (Object.keys(nextErrors).length > 0) return

    setIsSubmitting(true)

    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        subject: form.subject.trim(),
        message: form.message.trim(),
      }

      const response = await fetch(`${API_BASE}/api/contact`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      let result = null

      try {
        result = await response.json()
      } catch {
        result = null
      }

      if (!response.ok || !result?.success) {
        throw new Error(
          result?.message ||
            'We could not send your message right now. Please try again later.'
        )
      }

      setForm(initialForm)
      setSubmitSuccess(
        result?.message || 'Your message has been sent successfully.'
      )
    } catch (error) {
      setSubmitError(error.message || 'Unable to send your message right now.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen font-serif">
      <Navbar />

      <section className="relative overflow-hidden bg-linear-to-br from-emerald-50 via-white to-teal-50 py-16 sm:py-20">
        <div
          className="pointer-events-none absolute top-0 right-0 h-96 w-96 translate-x-1/3 -translate-y-1/3 rounded-full bg-emerald-100 blur-3xl opacity-40"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute bottom-0 left-0 h-80 w-80 -translate-x-1/3 translate-y-1/3 rounded-full bg-teal-100 blur-3xl opacity-30"
          aria-hidden="true"
        />

        <div className="relative mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-100 px-4 py-2 text-sm font-semibold text-emerald-700">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            Patient Support and Clinic Contact
          </div>

          <h1 className="mb-4 font-[pacifico] text-4xl font-bold leading-tight text-gray-900 sm:text-5xl lg:text-6xl">
            Contact{' '}
            <span className="bg-linear-to-r from-emerald-600 to-teal-500 bg-clip-text text-transparent">
              Our Care Team
            </span>
          </h1>

          <p className="mx-auto mb-10 max-w-3xl text-lg leading-relaxed text-gray-500">
            We are here to help with general questions, clinic information,
            appointment guidance, and patient support. Reach out in the way
            that feels easiest for you.
          </p>

          <div className="flex flex-wrap justify-center gap-10">
            {[
              { value: 'Same Day', label: 'Support Replies' },
              { value: 'Mon - Sat', label: 'Clinic Hours' },
              { value: 'Public', label: 'Page Access' },
            ].map(({ value, label }) => (
              <div key={label} className="text-center">
                <div className="text-2xl font-bold text-emerald-700 sm:text-3xl">
                  {value}
                </div>
                <div className="mt-1 text-xs uppercase tracking-wide text-gray-400">
                  {label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white py-14">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 sm:px-6 lg:grid-cols-3 lg:px-8">
          {contactCards.map((card) => (
            <InfoCard key={card.title} {...card} />
          ))}
        </div>
      </section>

      <section className="bg-linear-to-br from-emerald-50 to-teal-50 py-16">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-8 px-4 sm:px-6 lg:grid-cols-[1.15fr_0.85fr] lg:px-8">
          <div className="rounded-[2rem] border border-emerald-100 bg-white p-6 shadow-xl sm:p-8">
            <div className="mb-8">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">
                <MessageSquareMore className="h-4 w-4" />
                Send us a message
              </div>
              <h2 className="text-3xl font-bold text-gray-900">
                How can we help today?
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-gray-500 sm:text-base">
                Share your question and our team will review it as soon as
                possible. Your message will be sent securely to the clinic
                support system for follow-up.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="contact-name"
                    className="text-sm font-semibold text-gray-700"
                  >
                    Full name
                  </label>
                  <input
                    id="contact-name"
                    type="text"
                    value={form.name}
                    onChange={handleChange('name')}
                    placeholder="Enter your full name"
                    className="mt-2 w-full rounded-2xl border border-emerald-200 bg-emerald-50/40 px-4 py-3 text-gray-800 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                    maxLength={80}
                  />
                  <FieldError message={errors.name} />
                </div>

                <div>
                  <label
                    htmlFor="contact-email"
                    className="text-sm font-semibold text-gray-700"
                  >
                    Email address
                  </label>
                  <input
                    id="contact-email"
                    type="email"
                    value={form.email}
                    onChange={handleChange('email')}
                    placeholder="you@example.com"
                    className="mt-2 w-full rounded-2xl border border-emerald-200 bg-emerald-50/40 px-4 py-3 text-gray-800 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                    maxLength={120}
                  />
                  <FieldError message={errors.email} />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="contact-phone"
                    className="text-sm font-semibold text-gray-700"
                  >
                    Phone number
                  </label>
                  <input
                    id="contact-phone"
                    type="tel"
                    value={form.phone}
                    onChange={handleChange('phone')}
                    placeholder="+961 76 000 000"
                    className="mt-2 w-full rounded-2xl border border-emerald-200 bg-emerald-50/40 px-4 py-3 text-gray-800 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                    maxLength={20}
                  />
                  <FieldError message={errors.phone} />
                </div>

                <div>
                  <label
                    htmlFor="contact-subject"
                    className="text-sm font-semibold text-gray-700"
                  >
                    Subject
                  </label>
                  <input
                    id="contact-subject"
                    type="text"
                    value={form.subject}
                    onChange={handleChange('subject')}
                    placeholder="How can we help?"
                    className="mt-2 w-full rounded-2xl border border-emerald-200 bg-emerald-50/40 px-4 py-3 text-gray-800 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                    maxLength={100}
                  />
                  <FieldError message={errors.subject} />
                </div>
              </div>

              <div>
                <label
                  htmlFor="contact-message"
                  className="text-sm font-semibold text-gray-700"
                >
                  Message
                </label>
                <textarea
                  id="contact-message"
                  rows="6"
                  value={form.message}
                  onChange={handleChange('message')}
                  placeholder="Please describe your question, concern, or support request."
                  className="mt-2 w-full rounded-[1.5rem] border border-emerald-200 bg-emerald-50/40 px-4 py-3 text-gray-800 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                  maxLength={1000}
                />
                <div className="mt-2 flex items-center justify-between gap-4">
                  <FieldError message={errors.message} />
                  <p className="text-xs text-gray-400">
                    {form.message.length}/1000
                  </p>
                </div>
              </div>

              <div
                className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
                role="note"
              >
                <div className="flex items-start gap-3">
                  <TriangleAlert className="mt-0.5 h-5 w-5 flex-shrink-0" />
                  <p>
                    Do not use this form for urgent medical emergencies. Please
                    call local emergency services or go to the nearest emergency
                    department immediately.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-linear-to-r from-emerald-500 to-teal-500 px-7 py-3.5 font-semibold text-white shadow-lg transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSubmitting ? (
                    <>
                      <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                      Sending message...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      Send Message
                    </>
                  )}
                </button>

                <p className="text-sm text-gray-500">
                  Public page. No patient login is required to contact the clinic.
                </p>
              </div>

              {(submitSuccess || submitError) && (
                <div
                  className={`rounded-2xl border px-4 py-3 text-sm ${
                    submitSuccess
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'border-rose-200 bg-rose-50 text-rose-700'
                  }`}
                  aria-live="polite"
                >
                  {submitSuccess || submitError}
                </div>
              )}
            </form>
          </div>

          <div className="space-y-6">
            <div className="rounded-[2rem] border border-emerald-100 bg-white p-6 shadow-xl sm:p-8">
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
                <Clock3 className="h-6 w-6" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900">
                Clinic hours
              </h3>
              <div className="mt-5 space-y-3 text-sm text-gray-600 sm:text-base">
                <div className="flex items-center justify-between gap-4 rounded-2xl bg-emerald-50 px-4 py-3">
                  <span>Monday - Friday</span>
                  <span className="font-semibold text-emerald-700">
                    8:00 AM - 6:00 PM
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4 rounded-2xl bg-emerald-50 px-4 py-3">
                  <span>Saturday</span>
                  <span className="font-semibold text-emerald-700">
                    9:00 AM - 2:00 PM
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4 rounded-2xl bg-gray-50 px-4 py-3">
                  <span>Sunday</span>
                  <span className="font-semibold text-gray-500">Closed</span>
                </div>
              </div>
            </div>

            <div className="rounded-[2rem] border border-emerald-100 bg-white p-6 shadow-xl sm:p-8">
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-100 text-teal-600">
                <MapPin className="h-6 w-6" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900">
                Location and visit info
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-gray-500 sm:text-base">
                Our clinic welcomes walk-in support for guidance, but booked
                appointments are recommended for consultations and specialist
                visits.
              </p>

              <div className="mt-5 rounded-[1.75rem] border border-emerald-100 bg-linear-to-br from-emerald-50 to-white p-5">
                <p className="font-semibold text-emerald-700">HealthCare Clinic</p>
                <p className="mt-2 text-sm text-gray-600">
                  Saida, Lebanon
                </p>
                <p className="mt-1 text-sm text-gray-600">
                  Front-desk support, appointment coordination, and patient help
                  are available during clinic hours.
                </p>
              </div>
            </div>

            <div className="rounded-[2rem] border border-emerald-100 bg-white p-6 shadow-xl sm:p-8">
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900">
                Patient support notes
              </h3>
              <ul className="mt-4 space-y-3 text-sm leading-relaxed text-gray-600 sm:text-base">
                <li>
                  Bring a valid phone number so the clinic can follow up if needed.
                </li>
                <li>
                  For booking-specific actions, use the Appointments page after signing in.
                </li>
                <li>
                  Include as much detail as possible so the right team can assist you faster.
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white py-16">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">
              <Headphones className="h-4 w-4" />
              Helpful answers
            </div>
            <h2 className={hs.sectionTitle}>
              Frequently Asked{' '}
              <span className={hs.sectionTitleSpan}>Questions</span>
            </h2>
            <p className={hs.sectionSubtitle}>
              A few quick answers to common patient support questions.
            </p>
          </div>

          <div className="space-y-4">
            {faqItems.map((item) => (
              <div
                key={item.question}
                className="rounded-3xl border border-emerald-100 bg-emerald-50/60 p-6 shadow-sm"
              >
                <h3 className="text-lg font-bold text-gray-900">
                  {item.question}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600 sm:text-base">
                  {item.answer}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={hs.ctaSection}>
        <div className={hs.ctaBg1} aria-hidden="true" />
        <div className={hs.ctaBg2} aria-hidden="true" />

        <div className={hs.ctaContainer}>
          <h2 className={hs.ctaTitle}>Need care as well as support?</h2>
          <p className={hs.ctaSubtitle}>
            Browse our doctors, explore services, or manage your appointments
            when you are ready.
          </p>

          <div className={hs.ctaButtons}>
            <SignedOut>
              <button
                onClick={() => clerk.openSignIn()}
                className={hs.ctaPrimaryBtn}
              >
                <CalendarDays className="h-5 w-5" />
                Book Appointment
              </button>
            </SignedOut>

            <SignedIn>
              <Link to="/appointments" className={hs.ctaPrimaryBtn}>
                <CalendarDays className="h-5 w-5" />
                My Appointments
              </Link>
            </SignedIn>

            <Link to="/doctors" className={hs.ctaSecondaryBtn}>
              <Phone className="h-5 w-5" />
              Find a Doctor
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}

export default Contact
