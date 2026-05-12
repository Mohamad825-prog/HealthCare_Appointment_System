import React, { useEffect, useState, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useAuth, useClerk, SignedIn, SignedOut } from '@clerk/clerk-react'
import {
  CalendarDays, Clock, CreditCard, User,
  Stethoscope, Activity, Lock, RefreshCw, XCircle,
  Phone, AlertCircle,
} from 'lucide-react'

import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import { homePageStyles as hs } from '../assets/dummyStyles'

const API_BASE = 'http://localhost:4000'

// ── Date / time helpers ────────────────────────────────────────────────────────

const formatDate = (dateStr) => {
  if (!dateStr) return 'To be scheduled'
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  })
}

const formatServiceTime = (apt) => {
  if (apt.hour == null || apt.minute == null || !apt.ampm) return 'To be scheduled'
  const mm = String(apt.minute ?? 0).padStart(2, '0')
  return `${apt.hour}:${mm} ${apt.ampm ?? ''}`
}

const isUpcoming = (apt) => {
  if (apt.status === 'Canceled' || apt.status === 'Completed') return false
  if (!apt.date) return true
  return new Date(apt.date + 'T23:59:59') >= new Date()
}

const isPast = (apt) => {
  if (apt.status === 'Canceled') return false
  if (apt.status === 'Completed') return true
  if (!apt.date) return false
  return new Date(apt.date + 'T00:00:00') < new Date()
}

// ── Status badge ───────────────────────────────────────────────────────────────

const StatusBadge = ({ status }) => {
  const map = {
    Pending:     'bg-amber-100   text-amber-700   border-amber-200',
    Confirmed:   'bg-emerald-100 text-emerald-700 border-emerald-200',
    Canceled:    'bg-rose-100    text-rose-700    border-rose-200',
    Completed:   'bg-slate-100   text-slate-600   border-slate-200',
    Rescheduled: 'bg-blue-100    text-blue-700    border-blue-200',
  }
  const cls = map[status] ?? 'bg-gray-100 text-gray-600 border-gray-200'
  return (
    <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full border ${cls}`}>
      {status ?? 'Unknown'}
    </span>
  )
}

// ── Payment badge ──────────────────────────────────────────────────────────────

const PaymentBadge = ({ payment }) => {
  if (!payment) return null
  const { amount } = payment
  const method = payment.method || 'Online'
  const status = payment.status || 'Pending'
  const normalizedMethod = String(method).toLowerCase()
  const normalizedStatus = String(status).toLowerCase()
  const isOnline   = normalizedMethod === 'online'
  const isCash     = normalizedMethod === 'cash'
  const isPaid     = normalizedStatus === 'paid'
  const isRefunded = normalizedStatus === 'refunded'
  const isFailed   = normalizedStatus === 'failed'
  const isPending  = normalizedStatus === 'pending' || normalizedStatus === 'unpaid'

  if (isRefunded) return (
    <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-purple-100 text-purple-600 border border-purple-200">
      💳 Refunded
    </span>
  )
  if (isFailed) return (
    <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-rose-50 text-rose-500 border border-rose-200">
      Online - Payment Failed
    </span>
  )
  if (isPaid) return (
    <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">
      {isCash ? 'Cash - Paid' : isOnline ? 'Online - Paid' : 'Paid'} · ${amount ?? 0}
    </span>
  )
  if (isCash && isPending) return (
    <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-amber-50 text-amber-600 border border-amber-200">
      Cash - Pay at clinic · ${amount ?? 0}
    </span>
  )
  if (isOnline && isPending) return (
    <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-amber-50 text-amber-600 border border-amber-200">
      Online - Payment Pending
    </span>
  )
  return (
    <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-gray-50 text-gray-500 border border-gray-200">
      💵 Pay at Clinic · ${amount ?? 0}
    </span>
  )
}

// ── Skeleton card ──────────────────────────────────────────────────────────────

const SkeletonCard = () => (
  <div className="animate-pulse bg-white rounded-2xl shadow-md overflow-hidden">
    <div className="bg-emerald-100 h-44" />
    <div className="p-5 space-y-3">
      <div className="h-5 bg-emerald-100 rounded-full w-3/4" />
      <div className="h-4 bg-emerald-100 rounded-full w-1/2" />
      <div className="flex gap-2">
        <div className="h-6 bg-emerald-100 rounded-full w-24" />
        <div className="h-6 bg-emerald-100 rounded-full w-20" />
      </div>
      <div className="h-4 bg-emerald-100 rounded-full w-2/3" />
      <div className="h-4 bg-emerald-100 rounded-full w-1/2" />
      <div className="h-9 bg-emerald-100 rounded-full mt-2" />
    </div>
  </div>
)

// ── Main component ─────────────────────────────────────────────────────────────

const Appointments = () => {
  const { isSignedIn, isLoaded, getToken } = useAuth()
  const clerk = useClerk()

  const [activeTab,    setActiveTab]    = useState('doctor')
  const [statusFilter, setStatusFilter] = useState('all')
  const [doctorAppts,  setDoctorAppts]  = useState([])
  const [serviceAppts, setServiceAppts] = useState([])
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState(null)
  const [cancellingId, setCancellingId] = useState(null)
  const [navbarShowing, setNavbarShowing] = useState(true)
  const lastScrollY = useRef(0)

  // Mirror Navbar hide/show scroll so the sticky tab bar top offset stays correct
  useEffect(() => {
    const handleScroll = () => {
      const y = window.scrollY
      setNavbarShowing(!(y > lastScrollY.current && y > 80))
      lastScrollY.current = y
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Fetch both appointment types once auth is ready
  useEffect(() => {
    if (isLoaded && isSignedIn) fetchAll()
  }, [isLoaded, isSignedIn])

  const fetchAll = async () => {
    setLoading(true)
    setError(null)
    try {
      const token   = await getToken()
      const headers = { Authorization: `Bearer ${token}` }

      const [drRes, svcRes] = await Promise.all([
        fetch(`${API_BASE}/api/appointments/me`,         { headers }),
        fetch(`${API_BASE}/api/service-appointments/me`, { headers }),
      ])

      const [drJson, svcJson] = await Promise.all([drRes.json(), svcRes.json()])

      if (!drJson.success)  throw new Error(drJson.message  || 'Failed to load doctor appointments')
      if (!svcJson.success) throw new Error(svcJson.message || 'Failed to load service appointments')

      setDoctorAppts(Array.isArray(drJson.data)   ? drJson.data   : [])
      setServiceAppts(Array.isArray(svcJson.data) ? svcJson.data  : [])
    } catch (err) {
      setError(err.message || 'Unable to load appointments. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = async (id, type) => {
    if (!window.confirm('Are you sure you want to cancel this appointment?')) return
    setCancellingId(id)
    try {
      const endpoint = type === 'doctor'
        ? `${API_BASE}/api/appointments/${id}/cancel`
        : `${API_BASE}/api/service-appointments/${id}/cancel`

      const res  = await fetch(endpoint, { method: 'POST' })
      const json = await res.json()

      if (json.success) {
        const updater = (prev) =>
          prev.map(a => (a._id === id || a.id === id) ? { ...a, status: 'Canceled' } : a)
        if (type === 'doctor') setDoctorAppts(updater)
        else                   setServiceAppts(updater)
      } else {
        alert(json.message || 'Failed to cancel appointment.')
      }
    } catch {
      alert('Network error. Please try again.')
    } finally {
      setCancellingId(null)
    }
  }

  // ── Derived data ───────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const appts = activeTab === 'doctor' ? doctorAppts : serviceAppts
    switch (statusFilter) {
      case 'upcoming': return appts.filter(isUpcoming)
      case 'past':     return appts.filter(isPast)
      case 'canceled': return appts.filter(a => a.status === 'Canceled')
      default:         return appts
    }
  }, [activeTab, doctorAppts, serviceAppts, statusFilter])

  const filterCounts = useMemo(() => {
    const appts = activeTab === 'doctor' ? doctorAppts : serviceAppts
    return {
      all:      appts.length,
      upcoming: appts.filter(isUpcoming).length,
      past:     appts.filter(isPast).length,
      canceled: appts.filter(a => a.status === 'Canceled').length,
    }
  }, [activeTab, doctorAppts, serviceAppts])

  const canCancel = (apt) => apt.status !== 'Canceled' && apt.status !== 'Completed'

  const getDocFallback  = (apt) => `https://i.pravatar.cc/300?u=dr-${apt._id || apt.id}`
  const getSvcFallback  = (apt) =>
    `https://placehold.co/400x240/d1fae5/059669?text=${encodeURIComponent(apt.serviceName || 'Service')}`

  // ── Render ─────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen font-serif">
      <Navbar />

      {/* ── Page Hero ──────────────────────────────────────────────────────────── */}
      <section className="relative bg-linear-to-br from-emerald-50 via-white to-teal-50 py-16 sm:py-20 overflow-hidden">
        <div
          className="absolute top-0 right-0 w-96 h-96 bg-emerald-100 rounded-full blur-3xl opacity-40 -translate-y-1/3 translate-x-1/3 pointer-events-none"
          aria-hidden="true"
        />
        <div
          className="absolute bottom-0 left-0 w-80 h-80 bg-teal-100 rounded-full blur-3xl opacity-30 translate-y-1/3 -translate-x-1/3 pointer-events-none"
          aria-hidden="true"
        />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-100 border border-emerald-200 rounded-full text-sm font-semibold text-emerald-700 mb-5">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            Your Health Journey
          </div>

          {/* Title */}
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight mb-4 font-[pacifico]">
            My{' '}
            <span className="text-transparent bg-clip-text bg-linear-to-r from-emerald-600 to-teal-500">
              Appointments
            </span>
          </h1>

          <p className="text-lg text-gray-500 max-w-2xl mx-auto mb-10 leading-relaxed">
            Track, manage, and review all your doctor visits and medical service
            bookings in one convenient place.
          </p>

          {/* Stats row — only when signed in and data loaded */}
          {isSignedIn && !loading && (
            <div className="flex gap-10 sm:gap-16 justify-center flex-wrap">
              {[
                { value: doctorAppts.length,  label: 'Doctor Appointments' },
                { value: serviceAppts.length, label: 'Service Appointments' },
                {
                  value:
                    doctorAppts.filter(a  => a.status  === 'Completed').length +
                    serviceAppts.filter(a => a.status  === 'Completed').length,
                  label: 'Completed',
                },
              ].map(({ value, label }) => (
                <div key={label} className="text-center">
                  <div className="text-2xl sm:text-3xl font-bold text-emerald-700">{value}</div>
                  <div className="text-xs text-gray-400 mt-1 uppercase tracking-wide">{label}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Not Signed In ──────────────────────────────────────────────────────── */}
      {isLoaded && !isSignedIn && (
        <section className="py-24 bg-linear-to-br from-emerald-50 to-teal-50">
          <div className="max-w-md mx-auto px-4 text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-emerald-100 mb-6">
              <Lock className="w-9 h-9 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-3">Sign In to View Appointments</h2>
            <p className="text-gray-500 mb-8 leading-relaxed">
              Please sign in to access your booking history, manage upcoming
              appointments, and track your healthcare journey.
            </p>
            <button
              onClick={() => clerk.openSignIn()}
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-linear-to-r from-emerald-500 to-teal-500 text-white font-semibold shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 mb-8"
            >
              <CalendarDays className="w-5 h-5" />
              Sign In to Continue
            </button>
            <div className="flex justify-center gap-6 flex-wrap">
              <Link
                to="/doctors"
                className="inline-flex items-center gap-1.5 text-sm text-emerald-600 font-medium hover:underline"
              >
                <Stethoscope className="w-4 h-4" />
                Browse Doctors
              </Link>
              <Link
                to="/services"
                className="inline-flex items-center gap-1.5 text-sm text-teal-600 font-medium hover:underline"
              >
                <Activity className="w-4 h-4" />
                Browse Services
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ── Signed-in content ──────────────────────────────────────────────────── */}
      {isLoaded && isSignedIn && (
        <>
          {/* ── Sticky tab + filter bar ── */}
          <section
            className={`bg-white border-b border-emerald-100 shadow-sm sticky z-30 transition-[top] duration-500 ${
              navbarShowing ? 'top-20' : 'top-0'
            }`}
          >
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              {/* Tabs */}
              <div className="flex items-center gap-1 overflow-x-auto pt-4 pb-0">
                {[
                  { key: 'doctor',  label: 'Doctor Appointments',  icon: <Stethoscope className="w-4 h-4" />, count: doctorAppts.length },
                  { key: 'service', label: 'Service Appointments', icon: <Activity     className="w-4 h-4" />, count: serviceAppts.length },
                ].map(({ key, label, icon, count }) => (
                  <button
                    key={key}
                    onClick={() => { setActiveTab(key); setStatusFilter('all') }}
                    className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold rounded-t-xl border-b-2 transition-all whitespace-nowrap ${
                      activeTab === key
                        ? 'border-emerald-500 text-emerald-700 bg-emerald-50'
                        : 'border-transparent text-gray-500 hover:text-emerald-600 hover:bg-emerald-50/50'
                    }`}
                  >
                    {icon}
                    {label}
                    {!loading && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                        activeTab === key ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {count}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Filter pills + refresh */}
              <div className="flex items-center justify-between gap-3 py-3 overflow-x-auto">
                <div className="flex items-center gap-2">
                  {[
                    { key: 'all',      label: 'All'      },
                    { key: 'upcoming', label: 'Upcoming' },
                    { key: 'past',     label: 'Past'     },
                    { key: 'canceled', label: 'Canceled' },
                  ].map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setStatusFilter(key)}
                      className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-all whitespace-nowrap ${
                        statusFilter === key
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-emerald-300 hover:text-emerald-600'
                      }`}
                    >
                      {label}
                      {!loading && (
                        <span className={`ml-1 ${statusFilter === key ? 'text-emerald-100' : 'text-gray-400'}`}>
                          ({filterCounts[key]})
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                <button
                  onClick={fetchAll}
                  disabled={loading}
                  aria-label="Refresh appointments"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-emerald-600 border border-emerald-200 hover:bg-emerald-50 transition-all flex-shrink-0 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>
            </div>
          </section>

          {/* ── Appointments content area ── */}
          <section className="py-12 bg-linear-to-br from-emerald-50 to-teal-50 min-h-[50vh]">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

              {/* Result count */}
              {!loading && !error && (
                <p className="text-sm text-emerald-700 font-medium mb-8">
                  {filtered.length === 0
                    ? 'No appointments found'
                    : (
                      <>
                        Showing{' '}
                        <span className="font-bold text-emerald-800">{filtered.length}</span>
                        {' '}appointment{filtered.length !== 1 ? 's' : ''}
                        {statusFilter !== 'all' && (
                          <span className="ml-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-xs font-semibold capitalize">
                            {statusFilter}
                          </span>
                        )}
                      </>
                    )}
                </p>
              )}

              {/* ── Error State ── */}
              {error && (
                <div className="text-center py-20">
                  <div className="text-6xl mb-4">⚠️</div>
                  <h3 className="text-xl font-bold text-gray-700 mb-2">Something Went Wrong</h3>
                  <p className="text-gray-500 mb-6 max-w-sm mx-auto">{error}</p>
                  <button
                    onClick={fetchAll}
                    className="px-7 py-3 rounded-full bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-all shadow-md hover:shadow-lg"
                  >
                    Try Again
                  </button>
                </div>
              )}

              {/* ── Loading Skeletons ── */}
              {loading && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
                </div>
              )}

              {/* ── Empty State ── */}
              {!loading && !error && filtered.length === 0 && (
                <div className="text-center py-20">
                  <div className="text-7xl mb-4">📋</div>
                  <h3 className="text-xl font-bold text-gray-700 mb-2">
                    {statusFilter !== 'all'
                      ? `No ${statusFilter} appointments`
                      : 'No Appointments Yet'}
                  </h3>
                  <p className="text-gray-500 mb-8 max-w-sm mx-auto">
                    {statusFilter !== 'all'
                      ? 'Try switching to "All" to see all your appointments.'
                      : activeTab === 'doctor'
                        ? 'You have no doctor appointments yet. Book a visit with one of our certified specialists.'
                        : 'You have no service appointments yet. Explore our professional medical services.'}
                  </p>
                  {statusFilter !== 'all' ? (
                    <button
                      onClick={() => setStatusFilter('all')}
                      className="px-7 py-3 rounded-full bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-all shadow-md hover:shadow-lg"
                    >
                      Show All
                    </button>
                  ) : (
                    <Link
                      to={activeTab === 'doctor' ? '/doctors' : '/services'}
                      className="inline-flex items-center gap-2 px-7 py-3 rounded-full bg-linear-to-r from-emerald-500 to-teal-500 text-white font-semibold hover:shadow-lg hover:-translate-y-0.5 transition-all shadow-md"
                    >
                      <CalendarDays className="w-4 h-4" />
                      {activeTab === 'doctor' ? 'Browse Doctors' : 'Browse Services'}
                    </Link>
                  )}
                </div>
              )}

              {/* ── Appointments Grid ── */}
              {!loading && !error && filtered.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filtered.map((apt) => {
                    const isDr         = activeTab === 'doctor'
                    const aptId        = apt._id || apt.id
                    const isCancelling = cancellingId === aptId
                    const imgSrc       = isDr
                      ? (apt.doctorImage?.url  || getDocFallback(apt))
                      : (apt.serviceImage?.url || getSvcFallback(apt))
                    const title    = isDr ? (apt.doctorName  || 'Doctor')  : (apt.serviceName || 'Service')
                    const subtitle = isDr ? (apt.speciality  || 'Specialist') : null
                    const aptTime  = isDr ? (apt.time || 'N/A') : formatServiceTime(apt)

                    return (
                      <article
                        key={aptId}
                        className={`group bg-white rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden flex flex-col ${
                          apt.status === 'Canceled' ? 'opacity-70' : ''
                        }`}
                      >
                        {/* ── Image ── */}
                        <div className="relative h-44 overflow-hidden rounded-t-2xl">
                          <img
                            src={imgSrc}
                            alt={title}
                            className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
                            onError={(e) => {
                              e.currentTarget.src = isDr ? getDocFallback(apt) : getSvcFallback(apt)
                            }}
                          />
                          <div className="absolute inset-0 bg-linear-to-t from-black/30 via-transparent to-transparent pointer-events-none" />

                          {/* Status badge */}
                          <div className="absolute top-3 right-3">
                            <StatusBadge status={apt.status} />
                          </div>

                          {/* Type badge */}
                          <span className="absolute bottom-3 left-3 text-xs font-semibold px-2.5 py-1 rounded-full bg-white/90 text-gray-700 shadow">
                            {isDr ? '🩺 Doctor Visit' : '🏥 Medical Service'}
                          </span>
                        </div>

                        {/* ── Card body ── */}
                        <div className="p-5 flex flex-col gap-2.5 flex-1">

                          {/* Title + speciality */}
                          <div>
                            <h3 className="text-base font-bold text-gray-900 line-clamp-1">{title}</h3>
                            {subtitle && (
                              <p className="text-sm text-emerald-600 font-semibold flex items-center gap-1.5 mt-0.5">
                                <Stethoscope className="w-3.5 h-3.5 flex-shrink-0" />
                                {subtitle}
                              </p>
                            )}
                          </div>

                          {/* Date & Time */}
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
                            <span className="flex items-center gap-1.5">
                              <CalendarDays className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                              {formatDate(apt.date)}
                            </span>
                            <span className="flex items-center gap-1.5">
                              <Clock className="w-4 h-4 text-teal-500 flex-shrink-0" />
                              {aptTime}
                            </span>
                          </div>

                          {/* Fee */}
                          <div className="flex items-center gap-1.5 text-sm">
                            <CreditCard className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            <span className="font-bold text-emerald-700">${apt.fees ?? 0}</span>
                            <span className="text-gray-400 text-xs">consultation fee</span>
                          </div>

                          {/* Patient */}
                          <div className="flex items-center gap-1.5 text-sm text-gray-500">
                            <User className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                            <span className="line-clamp-1">
                              {apt.patientName || 'Patient'}
                              {apt.gender && ` · ${apt.gender}`}
                              {apt.age && ` · ${apt.age} yrs`}
                            </span>
                          </div>

                          {/* Mobile */}
                          {apt.mobile && (
                            <div className="flex items-center gap-1.5 text-xs text-gray-400">
                              <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                              {apt.mobile}
                            </div>
                          )}

                          {/* Payment badge */}
                          <div className="mt-0.5">
                            <PaymentBadge payment={apt.payment} />
                          </div>

                          {/* Rescheduled notice */}
                          {apt.status === 'Rescheduled' && apt.rescheduledTo && (
                            <div className="text-xs bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 text-blue-700">
                              <span className="font-semibold">Rescheduled to: </span>
                              {formatDate(apt.rescheduledTo.date)}
                              {apt.rescheduledTo.time ? ` at ${apt.rescheduledTo.time}` : ''}
                            </div>
                          )}

                          {/* Notes */}
                          {apt.notes && (
                            <p className="text-xs text-gray-400 italic line-clamp-2 border-t border-gray-100 pt-2">
                              {apt.notes}
                            </p>
                          )}

                          {/* Spacer */}
                          <div className="flex-1" />

                          {/* ── Cancel action ── */}
                          {canCancel(apt) && (
                            <div className="pt-3 border-t border-gray-100">
                              <button
                                onClick={() => handleCancel(aptId, activeTab)}
                                disabled={isCancelling}
                                className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-full text-sm font-semibold border border-rose-200 text-rose-600 hover:bg-rose-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {isCancelling
                                  ? <><RefreshCw className="w-4 h-4 animate-spin" /> Cancelling…</>
                                  : <><XCircle className="w-4 h-4" /> Cancel Appointment</>
                                }
                              </button>
                            </div>
                          )}
                        </div>
                      </article>
                    )
                  })}
                </div>
              )}
            </div>
          </section>

          {/* ── CTA Section ── */}
          {!loading && !error && (
            <section className={hs.ctaSection}>
              <div className={hs.ctaBg1} aria-hidden="true" />
              <div className={hs.ctaBg2} aria-hidden="true" />
              <div className={hs.ctaContainer}>
                <h2 className={hs.ctaTitle}>Need a New Appointment?</h2>
                <p className={hs.ctaSubtitle}>
                  Browse our certified doctors and professional medical services to
                  book your next visit with ease.
                </p>
                <div className={hs.ctaButtons}>
                  <Link to="/doctors" className={hs.ctaPrimaryBtn}>
                    <Stethoscope className="w-5 h-5" />
                    Book with a Doctor
                  </Link>
                  <Link to="/services" className={hs.ctaSecondaryBtn}>
                    <Activity className="w-5 h-5" />
                    Browse Services
                  </Link>
                </div>
              </div>
            </section>
          )}
        </>
      )}

      <Footer />
    </div>
  )
}

export default Appointments
