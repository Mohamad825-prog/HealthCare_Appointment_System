import React, { useEffect, useState, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useClerk, SignedIn, SignedOut } from '@clerk/clerk-react'
import {
  Search, CalendarDays, XCircle, Clock, X,
  Activity, Stethoscope, Phone,
} from 'lucide-react'

import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import { homePageStyles as hs } from '../assets/dummyStyles'

const API_BASE = 'http://localhost:4000'

// ── Slot helpers (mirrors Home.jsx / ServicesPreview pattern) ──────────────────

const getLocalDateStr = (date = new Date()) => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const parseTimeToMinutes = (t = '') => {
  const [time = '0:00', ampm = ''] = (t || '').trim().split(' ')
  const [hh = '0', mm = '0'] = time.split(':')
  let h = parseInt(hh, 10) % 12
  if (ampm.toUpperCase() === 'PM') h += 12
  return h * 60 + parseInt(mm || '0', 10)
}

const computeNextSlot = (slots = {}) => {
  const now = new Date()
  const todayStr = getLocalDateStr(now)
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  let best = null

  Object.entries(slots).forEach(([dateStr, times]) => {
    if (!Array.isArray(times) || times.length === 0) return
    if (dateStr < todayStr) return

    times.forEach((time) => {
      const mins = parseTimeToMinutes(time)
      if (dateStr === todayStr && mins <= nowMinutes) return

      if (
        !best ||
        dateStr < best.dateStr ||
        (dateStr === best.dateStr && mins < best.minutes)
      ) {
        best = { dateStr, time, minutes: mins }
      }
    })
  })

  return best
}

const formatNextSlot = (slot) => {
  if (!slot) return null
  const todayStr = getLocalDateStr()
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = getLocalDateStr(tomorrow)

  let label
  if (slot.dateStr === todayStr) label = 'Today'
  else if (slot.dateStr === tomorrowStr) label = 'Tomorrow'
  else {
    const d = new Date(slot.dateStr + 'T00:00:00')
    label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }
  return `${label} · ${slot.time}`
}

// ── Skeleton card ──────────────────────────────────────────────────────────────

const SkeletonCard = () => (
  <div className="animate-pulse bg-white rounded-2xl shadow-md overflow-hidden">
    <div className="bg-emerald-100 h-48" />
    <div className="p-5 space-y-3">
      <div className="h-5 bg-emerald-100 rounded-full w-3/4" />
      <div className="h-4 bg-emerald-100 rounded-full w-full" />
      <div className="h-4 bg-emerald-100 rounded-full w-2/3" />
      <div className="h-4 bg-emerald-100 rounded-full w-1/2" />
      <div className="h-9 bg-emerald-100 rounded-full mt-2" />
    </div>
  </div>
)

// ── Main page component ────────────────────────────────────────────────────────

const Services = () => {
  const [services, setServices]           = useState([])
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState(null)
  const [searchQuery, setSearch]          = useState('')
  const [availabilityFilter, setFilter]   = useState('All')
  const [navbarShowing, setNavbarShowing] = useState(true)
  const lastScrollY = useRef(0)

  const clerk = useClerk()

  // Mirror Navbar hide/show scroll logic so the sticky filter bar top offset is correct
  useEffect(() => {
    const handleScroll = () => {
      const y = window.scrollY
      setNavbarShowing(!(y > lastScrollY.current && y > 80))
      lastScrollY.current = y
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // ── Data fetching ─────────────────────────────────────────────────────────────

  const fetchServices = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/api/services`)
      if (!res.ok) throw new Error('Network error')
      const json = await res.json()
      if (json.success && Array.isArray(json.data)) {
        setServices(json.data)
      } else {
        throw new Error('Invalid response shape')
      }
    } catch {
      setError('Unable to load services right now. Please check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchServices() }, [])

  // ── Derived data ──────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    return services.filter((svc) => {
      const matchesSearch =
        !q ||
        (svc.name || '').toLowerCase().includes(q) ||
        (svc.about || '').toLowerCase().includes(q) ||
        (svc.shortDescription || '').toLowerCase().includes(q)

      const isAvail = svc.available !== false
      const matchesFilter =
        availabilityFilter === 'All' ||
        (availabilityFilter === 'Available' && isAvail) ||
        (availabilityFilter === 'Unavailable' && !isAvail)

      return matchesSearch && matchesFilter
    })
  }, [services, searchQuery, availabilityFilter])

  const clearFilters = () => {
    setSearch('')
    setFilter('All')
  }

  const hasActiveFilters = searchQuery.trim() || availabilityFilter !== 'All'

  const fallbackImage = (name) =>
    `https://placehold.co/400x240/d1fae5/059669?text=${encodeURIComponent(name || 'Service')}`

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen font-serif">
      <Navbar />

      {/* ── Page Hero ──────────────────────────────────────────────────────────── */}
      <section className="relative bg-linear-to-br from-emerald-50 via-white to-teal-50 py-16 sm:py-20 overflow-hidden">
        {/* Decorative blobs */}
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
            Comprehensive Healthcare Services
          </div>

          {/* Title */}
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight mb-4 font-[pacifico]">
            Our Medical{' '}
            <span className="text-transparent bg-clip-text bg-linear-to-r from-emerald-600 to-teal-500">
              Services
            </span>
          </h1>

          <p className="text-lg text-gray-500 max-w-2xl mx-auto mb-10 leading-relaxed">
            Explore our wide range of professional medical services designed to
            support every aspect of your health. Find what you need, check
            availability, and book your appointment in seconds.
          </p>

          {/* Stats row */}
          <div className="flex gap-10 sm:gap-16 justify-center flex-wrap">
            {[
              { value: loading ? '—' : `${services.length}+`, label: 'Services' },
              { value: '10K+', label: 'Patients Served' },
              { value: '100%', label: 'Certified Staff' },
            ].map(({ value, label }) => (
              <div key={label} className="text-center">
                <div className="text-2xl sm:text-3xl font-bold text-emerald-700">{value}</div>
                <div className="text-xs text-gray-400 mt-1 uppercase tracking-wide">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Search & Filter Bar ─────────────────────────────────────────────────── */}
      <section
        className={`bg-white py-6 border-b border-emerald-100 shadow-sm sticky z-30 transition-[top] duration-500 ${
          navbarShowing ? 'top-20' : 'top-0'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row gap-4 items-stretch sm:items-center">

          {/* Search input */}
          <div className="relative flex-1 sm:max-w-md">
            <Search
              className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-emerald-500 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="text"
              placeholder="Search services by name or description…"
              value={searchQuery}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-12 pr-10 py-3 rounded-full border border-emerald-200 bg-white text-gray-800 placeholder-gray-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-300 transition-all text-sm"
              aria-label="Search services"
            />
            {searchQuery && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
                aria-label="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Availability filter */}
          <div className="flex items-center gap-2">
            <Activity
              className="w-4 h-4 text-emerald-600 flex-shrink-0"
              aria-hidden="true"
            />
            <select
              value={availabilityFilter}
              onChange={(e) => setFilter(e.target.value)}
              className="py-3 px-4 rounded-full border border-emerald-200 bg-white text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 transition-all text-sm w-full sm:w-48"
              aria-label="Filter by availability"
            >
              <option value="All">All Services</option>
              <option value="Available">Available</option>
              <option value="Unavailable">Unavailable</option>
            </select>
          </div>

          {/* Clear filters button */}
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center justify-center gap-1.5 px-4 py-3 rounded-full border border-rose-200 text-rose-600 text-sm font-medium hover:bg-rose-50 transition-all flex-shrink-0"
            >
              <X className="w-3.5 h-3.5" />
              Clear
            </button>
          )}
        </div>
      </section>

      {/* ── Services Grid ───────────────────────────────────────────────────────── */}
      <section className="py-14 bg-linear-to-br from-emerald-50 to-teal-50 min-h-[50vh]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

          {/* Result count */}
          {!loading && !error && (
            <p className="text-sm text-emerald-700 font-medium mb-8">
              {filtered.length === 0
                ? 'No services found'
                : (
                  <>
                    Showing{' '}
                    <span className="font-bold text-emerald-800">{filtered.length}</span>
                    {' '}service{filtered.length !== 1 ? 's' : ''}
                    {availabilityFilter !== 'All' && (
                      <span className="ml-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-xs font-semibold">
                        {availabilityFilter}
                      </span>
                    )}
                    {searchQuery.trim() && (
                      <span className="ml-1 text-gray-500">
                        for &ldquo;{searchQuery.trim()}&rdquo;
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
                onClick={fetchServices}
                className="px-7 py-3 rounded-full bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-all shadow-md hover:shadow-lg"
              >
                Try Again
              </button>
            </div>
          )}

          {/* ── Loading Skeleton ── */}
          {loading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {Array.from({ length: 8 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          )}

          {/* ── Empty State ── */}
          {!loading && !error && filtered.length === 0 && (
            <div className="text-center py-20">
              <div className="text-7xl mb-4">🩺</div>
              <h3 className="text-xl font-bold text-gray-700 mb-2">No Services Found</h3>
              <p className="text-gray-500 mb-6">
                {hasActiveFilters
                  ? 'Try adjusting your search or filter.'
                  : 'No services are listed at the moment. Please check back soon.'}
              </p>
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="px-7 py-3 rounded-full bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-all shadow-md hover:shadow-lg"
                >
                  Clear Filters
                </button>
              )}
            </div>
          )}

          {/* ── Services Grid ── */}
          {!loading && !error && filtered.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {filtered.map((svc) => {
                const isAvail  = svc.available !== false
                const imgSrc   = svc.imageUrl || fallbackImage(svc.name)
                const nextSlot = computeNextSlot(svc.slots || {})
                const nextSlotText = isAvail ? formatNextSlot(nextSlot) : null
                const descText = svc.shortDescription || svc.about || ''

                return (
                  <article
                    key={svc.id}
                    className={`group bg-white rounded-2xl shadow-md hover:shadow-2xl transition-all duration-300 overflow-hidden flex flex-col${!isAvail ? ' opacity-85' : ''}`}
                  >
                    {/* ── Service Image ── */}
                    <div className="relative h-48 overflow-hidden rounded-t-2xl">
                      <img
                        src={imgSrc}
                        alt={svc.name || 'Service'}
                        className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
                        onError={(e) => {
                          e.currentTarget.src = fallbackImage(svc.name)
                        }}
                      />
                      {/* Gradient overlay */}
                      <div className="absolute inset-0 bg-linear-to-t from-black/20 via-transparent to-transparent pointer-events-none" />

                      {/* Availability badge */}
                      <span
                        className={`absolute top-3 right-3 text-xs font-bold px-2.5 py-1 rounded-full shadow-sm border ${
                          isAvail
                            ? 'bg-emerald-100/95 text-emerald-700 border-emerald-300'
                            : 'bg-rose-50/95 text-rose-700 border-rose-200'
                        }`}
                      >
                        {isAvail ? 'Available' : 'Unavailable'}
                      </span>

                      {/* Price badge */}
                      {svc.price > 0 && (
                        <span className="absolute bottom-3 left-3 bg-white/95 text-emerald-700 text-xs font-bold px-3 py-1 rounded-full shadow border border-emerald-100">
                          ${svc.price}
                        </span>
                      )}
                    </div>

                    {/* ── Card Body ── */}
                    <div className="p-5 flex flex-col flex-1">

                      {/* Service name */}
                      <h3 className="text-base font-bold text-gray-900 mb-1.5 font-serif line-clamp-1">
                        {svc.name || 'Service'}
                      </h3>

                      {/* Description */}
                      {descText && (
                        <p className="text-gray-500 text-sm leading-relaxed line-clamp-2 mb-3">
                          {descText}
                        </p>
                      )}

                      {/* Next available slot */}
                      {nextSlotText && (
                        <div className="inline-flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-full px-3 py-1.5 mb-3 w-fit">
                          <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                          <span className="font-medium">{nextSlotText}</span>
                        </div>
                      )}

                      {/* Push button to bottom */}
                      <div className="flex-1" />

                      {/* ── CTA Button ── */}
                      <div className="mt-4">
                        {isAvail ? (
                          <Link
                            to={`/services/${svc.id}`}
                            className="inline-flex items-center justify-center gap-2 w-full py-2.5 rounded-full bg-linear-to-r from-emerald-500 to-teal-500 text-white font-semibold text-sm shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"
                          >
                            <CalendarDays className="w-4 h-4" />
                            Book Now
                          </Link>
                        ) : (
                          <button
                            disabled
                            aria-disabled="true"
                            className="inline-flex items-center justify-center gap-2 w-full py-2.5 rounded-full bg-gray-200 text-gray-400 font-semibold text-sm cursor-not-allowed"
                          >
                            <XCircle className="w-4 h-4" />
                            Unavailable
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </div>
      </section>

      {/* ── CTA Banner ──────────────────────────────────────────────────────────── */}
      <section className={hs.ctaSection}>
        <div className={hs.ctaBg1} aria-hidden="true" />
        <div className={hs.ctaBg2} aria-hidden="true" />

        <div className={hs.ctaContainer}>
          <h2 className={hs.ctaTitle}>
            Ready to Book a Service?
          </h2>
          <p className={hs.ctaSubtitle}>
            Choose a service above, pick a convenient time slot, and let our
            certified specialists take care of your health.
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

      <Footer />
    </div>
  )
}

export default Services
