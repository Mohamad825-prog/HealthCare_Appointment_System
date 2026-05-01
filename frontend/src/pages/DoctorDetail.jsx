import React, { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth, useUser, useClerk, SignedIn, SignedOut } from '@clerk/clerk-react'
import {
  ArrowLeft, CalendarDays, Clock, MapPin, Star, Users, Award,
  Stethoscope, Lock, CheckCircle, AlertCircle, CreditCard,
  XCircle, ChevronRight,
} from 'lucide-react'

import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import { homePageStyles as hs } from '../assets/dummyStyles'

const API_BASE = 'http://localhost:4000'

// ── Tiny helpers ──────────────────────────────────────────────────────────────

const todayStr = () => {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}

const displayDate = (dateStr) => {
  if (!dateStr) return ''
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  })
}

// ── Sub-components ─────────────────────────────────────────────────────────────

const StarRating = ({ rating }) => {
  const filled = Math.round(rating || 0)
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`w-4 h-4 ${i < filled ? 'text-amber-400 fill-amber-400' : 'text-gray-200 fill-gray-200'}`}
        />
      ))}
    </div>
  )
}

const DetailSkeleton = () => (
  <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 animate-pulse">
    <div className="h-7 bg-emerald-100 rounded-full w-36 mb-8" />
    <div className="bg-white rounded-3xl shadow-md overflow-hidden mb-6">
      <div className="bg-emerald-100 h-28" />
      <div className="px-6 pb-6 pt-0">
        <div className="flex gap-4 -mt-14 mb-4">
          <div className="w-28 h-28 rounded-2xl bg-emerald-200 flex-shrink-0" />
          <div className="flex-1 pt-16 space-y-2">
            <div className="h-6 bg-emerald-100 rounded-full w-3/4" />
            <div className="h-4 bg-emerald-100 rounded-full w-1/2" />
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {[80, 100, 64, 88].map(w => (
            <div key={w} className="h-7 bg-emerald-100 rounded-full" style={{ width: w }} />
          ))}
        </div>
        <div className="h-20 bg-emerald-100 rounded-xl mt-4" />
      </div>
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      <div className="lg:col-span-2 space-y-5">
        <div className="bg-white rounded-2xl h-64 shadow-sm" />
      </div>
      <div className="lg:col-span-3 bg-white rounded-2xl h-96 shadow-sm" />
    </div>
  </div>
)

// ── Main page ──────────────────────────────────────────────────────────────────

const DoctorDetail = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const { isSignedIn, isLoaded, getToken } = useAuth()
  const { user } = useUser()
  const clerk = useClerk()

  const [doctor, setDoctor]           = useState(null)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState(null)
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedTime, setSelectedTime] = useState('')
  const [form, setForm] = useState({
    patientName: '',
    mobile: '',
    age: '',
    gender: 'Male',
    paymentMethod: 'Online',
  })
  const [booking, setBooking]           = useState(false)
  const [bookingError, setBookingError] = useState(null)
  const [bookingSuccess, setBookingSuccess] = useState(false)

  // ── Fetch doctor ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`${API_BASE}/api/doctors/${id}`)
        if (!res.ok) throw new Error('Doctor not found')
        const json = await res.json()
        if (json.success && json.data) {
          if (!cancelled) setDoctor(json.data)
        } else {
          throw new Error(json.message || 'Doctor not found')
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Unable to load doctor details')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [id])

  // Pre-fill name from Clerk user
  useEffect(() => {
    if (user?.fullName) {
      setForm(prev => ({ ...prev, patientName: prev.patientName || user.fullName }))
    }
  }, [user])

  // ── Derived data ──────────────────────────────────────────────────────────────
  const futureDates = useMemo(() => {
    if (!doctor?.schedule) return []
    const today = todayStr()
    return Object.keys(doctor.schedule)
      .filter(d => d >= today && Array.isArray(doctor.schedule[d]) && doctor.schedule[d].length > 0)
      .sort()
  }, [doctor])

  const timeSlots = useMemo(() => {
    if (!selectedDate || !doctor?.schedule) return []
    return doctor.schedule[selectedDate] || []
  }, [selectedDate, doctor])

  const isAvailable =
    doctor?.availability === undefined ||
    doctor?.availability === 'Available' ||
    doctor?.availability === true

  // ── Handlers ──────────────────────────────────────────────────────────────────
  const handleDateSelect = (date) => {
    setSelectedDate(date)
    setSelectedTime('')
    setBookingError(null)
  }

  const handleField = (e) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
    setBookingError(null)
  }

  const handleBook = async (e) => {
    e.preventDefault()
    if (!form.patientName.trim()) { setBookingError('Please enter the patient full name.'); return }
    if (!form.mobile.trim())      { setBookingError('Please enter a mobile number.'); return }
    if (!selectedDate)            { setBookingError('Please select an appointment date.'); return }
    if (!selectedTime)            { setBookingError('Please select a time slot.'); return }

    setBooking(true)
    setBookingError(null)
    try {
      const token = await getToken()
      const email = user?.primaryEmailAddress?.emailAddress || ''
      const res = await fetch(`${API_BASE}/api/appointments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          doctorId: id,          // id from useParams() — same UUID used for GET
          patientName: form.patientName.trim(),
          mobile: form.mobile.trim(),
          age: form.age || '',
          gender: form.gender,
          date: selectedDate,
          time: selectedTime,
          fee: doctor.fee ?? 0,
          fees: doctor.fee ?? 0,
          paymentMethod: form.paymentMethod,
          email,
          doctorName: doctor.name || '',
          speciality: doctor.specialization || '',
          doctorImageUrl: doctor.image_url || doctor.imageUrl || '',
        }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.message || 'Booking failed')
      if (json.checkoutUrl) {
        window.location.href = json.checkoutUrl
      } else {
        setBookingSuccess(true)
        setTimeout(() => navigate('/appointments'), 2200)
      }
    } catch (err) {
      setBookingError(err.message || 'Booking failed. Please try again.')
    } finally {
      setBooking(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen font-serif">
      <Navbar />

      {/* ── Loading ──────────────────────────────────────────────────────── */}
      {loading && (
        <div className="bg-linear-to-br from-emerald-50 via-white to-teal-50">
          <DetailSkeleton />
        </div>
      )}

      {/* ── Error ────────────────────────────────────────────────────────── */}
      {!loading && error && (
        <div className="bg-linear-to-br from-emerald-50 via-white to-teal-50 min-h-[70vh] flex flex-col items-center justify-center px-4 py-24 text-center">
          <span className="text-6xl mb-4">🩺</span>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Doctor Not Found</h2>
          <p className="text-gray-500 mb-8 max-w-sm">{error}</p>
          <Link
            to="/doctors"
            className="inline-flex items-center gap-2 bg-emerald-600 text-white px-6 py-3 rounded-full font-semibold hover:bg-emerald-700 transition-colors shadow-md"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Doctors
          </Link>
        </div>
      )}

      {/* ── Content ──────────────────────────────────────────────────────── */}
      {!loading && !error && doctor && (
        <>
          <div className="bg-linear-to-br from-emerald-50 via-white to-teal-50 min-h-screen pb-2">

            {/* Back link */}
            <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 pb-2">
              <Link
                to="/doctors"
                className="inline-flex items-center gap-1.5 text-sm text-emerald-600 hover:text-emerald-800 font-medium transition-colors group"
              >
                <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
                Back to Doctors
              </Link>
            </div>

            {/* ── Doctor profile card ──────────────────────────────────── */}
            <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-2 pb-6">
              <div className="bg-white rounded-3xl shadow-lg overflow-hidden border border-emerald-100">
                {/* Banner */}
                <div className="bg-linear-to-br from-emerald-500 to-teal-600 h-28 relative overflow-hidden">
                  <div className="absolute -top-10 -right-10 w-44 h-44 bg-white/10 rounded-full" />
                  <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-white/10 rounded-full" />
                </div>

                <div className="px-5 sm:px-8 pt-5 sm:pt-6 pb-7">
                  {/* Avatar + name */}
                  <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-end gap-4 mb-5">
                    <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-2xl border-4 border-white shadow-lg overflow-hidden bg-emerald-100 flex-shrink-0">
                      <img
                        src={doctor.image_url || `https://i.pravatar.cc/300?u=dr-${id}`}
                        alt={doctor.name}
                        className="w-full h-full object-cover"
                        onError={e => { e.currentTarget.src = `https://i.pravatar.cc/300?u=dr-${id}` }}
                      />
                    </div>
                    <div className="flex-1 sm:pb-2">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{doctor.name}</h1>
                        {isAvailable ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Available
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-600 border border-red-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                            Unavailable
                          </span>
                        )}
                      </div>
                      <p className="text-emerald-600 font-semibold text-lg">{doctor.specialization}</p>
                      <div className="flex flex-wrap items-center gap-3 mt-2">
                        {doctor.rating > 0 && (
                          <div className="flex items-center gap-1.5">
                            <StarRating rating={doctor.rating} />
                            <span className="text-sm text-gray-500">({doctor.rating}/5)</span>
                          </div>
                        )}
                        <span className="inline-flex items-center gap-1 bg-green-50 border border-green-200 px-3 py-1 rounded-full text-green-700 font-bold text-sm">
                          ${doctor.fee ?? 0} / visit
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Info chips */}
                  <div className="flex flex-wrap gap-2">
                    {doctor.experience && (
                      <span className="flex items-center gap-1 bg-teal-50 border border-teal-100 px-3 py-1 rounded-full text-teal-700 text-xs font-medium">
                        <Award className="w-3.5 h-3.5" />
                        {doctor.experience}
                      </span>
                    )}
                    {doctor.location && (
                      <span className="flex items-center gap-1 bg-gray-50 border border-gray-200 px-3 py-1 rounded-full text-gray-600 text-xs font-medium">
                        <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                        {doctor.location}
                      </span>
                    )}
                    {(doctor.patients || doctor.success) && (
                      <span className="flex items-center gap-1 bg-blue-50 border border-blue-100 px-3 py-1 rounded-full text-blue-600 text-xs font-medium">
                        <Users className="w-3.5 h-3.5" />
                        {doctor.patients || doctor.success}
                      </span>
                    )}
                    {doctor.qualifications && (
                      <span className="flex items-center gap-1 bg-purple-50 border border-purple-100 px-3 py-1 rounded-full text-purple-600 text-xs font-medium italic">
                        {doctor.qualifications}
                      </span>
                    )}
                  </div>

                  {/* About */}
                  {doctor.about && (
                    <div className="mt-5 border-t border-gray-100 pt-5">
                      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">About</h3>
                      <p className="text-gray-700 leading-relaxed text-sm sm:text-base">{doctor.about}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── Booking section ──────────────────────────────────────── */}
            <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-14">
              <h2 className="text-xl font-bold text-gray-800 mb-5 flex items-center gap-2">
                <CalendarDays className="w-5 h-5 text-emerald-500" />
                Book an Appointment
              </h2>

              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

                {/* Left: Schedule + time slots */}
                <div className="lg:col-span-2 space-y-5">

                  {/* Date picker */}
                  <div className="bg-white rounded-2xl shadow-sm border border-emerald-100 p-5">
                    <h3 className="font-semibold text-gray-700 flex items-center gap-2 mb-4 text-sm">
                      <CalendarDays className="w-4 h-4 text-emerald-500" />
                      Select a Date
                    </h3>
                    {futureDates.length === 0 ? (
                      <div className="text-center py-8">
                        <span className="text-4xl">📅</span>
                        <p className="text-gray-400 text-sm mt-3">No available slots at the moment</p>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                        {futureDates.map(date => (
                          <button
                            key={date}
                            onClick={() => handleDateSelect(date)}
                            className={`w-full text-left px-4 py-3 rounded-xl border text-sm font-medium transition-all duration-200 ${
                              selectedDate === date
                                ? 'bg-emerald-500 text-white border-emerald-500 shadow-md'
                                : 'bg-emerald-50 text-gray-700 border-emerald-100 hover:border-emerald-300 hover:bg-emerald-100'
                            }`}
                          >
                            <span className="flex justify-between items-center">
                              <span>{displayDate(date)}</span>
                              <span className="text-xs opacity-70">{(doctor.schedule[date] || []).length} slots</span>
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Time picker */}
                  {selectedDate && (
                    <div className="bg-white rounded-2xl shadow-sm border border-teal-100 p-5">
                      <h3 className="font-semibold text-gray-700 flex items-center gap-2 mb-4 text-sm">
                        <Clock className="w-4 h-4 text-teal-500" />
                        Select a Time — <span className="font-normal text-gray-400">{displayDate(selectedDate)}</span>
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {timeSlots.map(slot => (
                          <button
                            key={slot}
                            onClick={() => { setSelectedTime(slot); setBookingError(null) }}
                            className={`px-3.5 py-1.5 rounded-full border text-sm font-medium transition-all duration-200 ${
                              selectedTime === slot
                                ? 'bg-teal-500 text-white border-teal-500 shadow-md'
                                : 'bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100'
                            }`}
                          >
                            {slot}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Right: Patient form */}
                <div className="lg:col-span-3">
                  <div className="bg-white rounded-2xl shadow-sm border border-emerald-100 overflow-hidden">
                    {/* Form header */}
                    <div className="bg-linear-to-r from-emerald-500 to-teal-500 px-6 py-5">
                      <h2 className="text-white font-semibold text-lg flex items-center gap-2">
                        <Stethoscope className="w-5 h-5" />
                        Patient Details
                      </h2>
                      <p className="text-emerald-100 text-sm mt-0.5">
                        Fill in your information to confirm the booking
                      </p>
                    </div>

                    <div className="p-6">

                      {/* Not signed in */}
                      {isLoaded && !isSignedIn && (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                          <div className="w-16 h-16 rounded-full bg-emerald-50 border-2 border-emerald-200 flex items-center justify-center mb-4">
                            <Lock className="w-7 h-7 text-emerald-500" />
                          </div>
                          <h3 className="text-gray-800 font-semibold text-lg mb-2">Sign In to Book</h3>
                          <p className="text-gray-500 text-sm max-w-xs mb-6">
                            Please sign in to book an appointment with Dr. {doctor.name}.
                          </p>
                          <button
                            onClick={() => clerk.openSignIn()}
                            className="inline-flex items-center gap-2 bg-emerald-600 text-white px-7 py-3 rounded-full font-semibold hover:bg-emerald-700 transition-colors shadow-md"
                          >
                            <CalendarDays className="w-4 h-4" />
                            Sign In to Continue
                          </button>
                        </div>
                      )}

                      {/* Doctor unavailable */}
                      {isLoaded && isSignedIn && !isAvailable && (
                        <div className="flex flex-col items-center justify-center py-10 text-center">
                          <XCircle className="w-12 h-12 text-red-400 mb-3" />
                          <h3 className="text-gray-800 font-semibold text-lg mb-1">Currently Unavailable</h3>
                          <p className="text-gray-500 text-sm">
                            This doctor is not accepting appointments right now. Please check back later.
                          </p>
                        </div>
                      )}

                      {/* Booking success (cash/free) */}
                      {bookingSuccess && (
                        <div className="flex flex-col items-center justify-center py-10 text-center">
                          <CheckCircle className="w-14 h-14 text-emerald-500 mb-4" />
                          <h3 className="text-gray-800 font-semibold text-xl mb-1">Appointment Booked!</h3>
                          <p className="text-gray-500 text-sm">Redirecting to your appointments…</p>
                        </div>
                      )}

                      {/* Booking form */}
                      {isLoaded && isSignedIn && isAvailable && !bookingSuccess && (
                        <form onSubmit={handleBook} className="space-y-4">

                          {/* Selected slot summary */}
                          {(selectedDate || selectedTime) && (
                            <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm">
                              <p className="text-emerald-700 font-medium">
                                {selectedDate && <span>📅 {displayDate(selectedDate)}</span>}
                                {selectedDate && selectedTime && <span className="mx-2 text-emerald-300">|</span>}
                                {selectedTime && <span>🕐 {selectedTime}</span>}
                              </p>
                            </div>
                          )}

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {/* Patient Name */}
                            <div className="sm:col-span-2">
                              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                                Patient Full Name <span className="text-red-400">*</span>
                              </label>
                              <input
                                name="patientName"
                                value={form.patientName}
                                onChange={handleField}
                                placeholder="e.g. John Smith"
                                required
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition"
                              />
                            </div>

                            {/* Mobile */}
                            <div>
                              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                                Mobile Number <span className="text-red-400">*</span>
                              </label>
                              <input
                                name="mobile"
                                value={form.mobile}
                                onChange={handleField}
                                placeholder="+1 234 567 8900"
                                required
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition"
                              />
                            </div>

                            {/* Age */}
                            <div>
                              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Age</label>
                              <input
                                name="age"
                                type="number"
                                min="1"
                                max="120"
                                value={form.age}
                                onChange={handleField}
                                placeholder="e.g. 32"
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition"
                              />
                            </div>

                            {/* Gender */}
                            <div>
                              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Gender</label>
                              <select
                                name="gender"
                                value={form.gender}
                                onChange={handleField}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition bg-white"
                              >
                                <option>Male</option>
                                <option>Female</option>
                                <option>Other</option>
                                <option>Prefer not to say</option>
                              </select>
                            </div>

                            {/* Payment Method */}
                            <div>
                              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Payment</label>
                              <select
                                name="paymentMethod"
                                value={form.paymentMethod}
                                onChange={handleField}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition bg-white"
                              >
                                <option value="Online">💳 Pay Online (Stripe)</option>
                                <option value="Cash">💵 Pay at Clinic (Cash)</option>
                              </select>
                            </div>
                          </div>

                          {/* Fee summary */}
                          <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 flex justify-between items-center">
                            <span className="text-sm text-gray-600">Consultation Fee</span>
                            <span className="text-xl font-bold text-emerald-600">${doctor.fee ?? 0}</span>
                          </div>

                          {/* Error */}
                          {bookingError && (
                            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                              <p className="text-red-600 text-sm">{bookingError}</p>
                            </div>
                          )}

                          {/* Submit */}
                          <button
                            type="submit"
                            disabled={booking}
                            className="w-full flex items-center justify-center gap-2 bg-linear-to-r from-emerald-500 to-teal-500 text-white py-3.5 rounded-xl font-semibold text-sm shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed disabled:translate-y-0"
                          >
                            {booking ? (
                              <>
                                <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                Processing…
                              </>
                            ) : form.paymentMethod === 'Online' ? (
                              <>
                                <CreditCard className="w-4 h-4" />
                                Proceed to Payment — ${doctor.fee ?? 0}
                              </>
                            ) : (
                              <>
                                <CalendarDays className="w-4 h-4" />
                                Confirm Appointment
                              </>
                            )}
                          </button>

                          {!selectedDate && (
                            <p className="text-xs text-center text-gray-400">
                              ← Select a date and time slot on the left to continue
                            </p>
                          )}
                        </form>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── CTA section ──────────────────────────────────────────────── */}
          <section className={hs.ctaSection}>
            <div className={hs.ctaBg1} aria-hidden="true" />
            <div className={hs.ctaBg2} aria-hidden="true" />
            <div className={hs.ctaContainer}>
              <h2 className={hs.ctaTitle}>Looking for Other Specialists?</h2>
              <p className={hs.ctaSubtitle}>
                Browse our full team of certified doctors across all medical specializations.
              </p>
              <div className={hs.ctaButtons}>
                <Link to="/doctors" className={hs.ctaPrimaryBtn}>
                  <Stethoscope className="w-5 h-5" />
                  All Doctors
                </Link>
                <Link to="/appointments" className={hs.ctaSecondaryBtn}>
                  <CalendarDays className="w-5 h-5" />
                  My Appointments
                </Link>
              </div>
            </div>
          </section>
        </>
      )}

      <Footer />
    </div>
  )
}

export default DoctorDetail
