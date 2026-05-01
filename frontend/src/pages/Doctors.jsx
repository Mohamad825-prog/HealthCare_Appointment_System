import React, { useEffect, useState, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useClerk, SignedIn, SignedOut } from '@clerk/clerk-react'
import {
  Search, CalendarDays, XCircle, MapPin, Star,
  Users, SlidersHorizontal, X, Stethoscope, Award,
  Phone,
} from 'lucide-react'

import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import { homePageStyles as hs } from '../assets/dummyStyles'

const API_BASE = 'http://localhost:4000'

// ── Small helpers ──────────────────────────────────────────────────────────────

const StarRating = ({ rating }) => {
  const rounded = Math.round(rating || 0)
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`w-3.5 h-3.5 ${
            i < rounded
              ? 'text-amber-400 fill-amber-400'
              : 'text-gray-200 fill-gray-200'
          }`}
        />
      ))}
    </div>
  )
}

const SkeletonCard = () => (
  <div className="animate-pulse bg-white rounded-3xl shadow-md overflow-hidden">
    <div className="bg-emerald-100 h-52" />
    <div className="p-4 space-y-3">
      <div className="h-5 bg-emerald-100 rounded-full w-3/4" />
      <div className="h-4 bg-emerald-100 rounded-full w-1/2" />
      <div className="flex gap-2">
        <div className="h-6 bg-emerald-100 rounded-full w-24" />
        <div className="h-6 bg-emerald-100 rounded-full w-20" />
      </div>
      <div className="h-9 bg-emerald-100 rounded-full mt-3" />
    </div>
  </div>
)

// ── Main component ─────────────────────────────────────────────────────────────

const Doctors = () => {
  const [doctors, setDoctors]         = useState([])
  const [totalDoctors, setTotalDoctors] = useState(null)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState(null)
  const [searchQuery, setSearch]      = useState('')
  const [selectedSpec, setSpec]       = useState('All')
  const [navbarShowing, setNavbarShowing] = useState(true)
  const lastScrollY = useRef(0)

  const clerk = useClerk()

  // Mirror the Navbar hide/show scroll logic so the sticky top offset stays correct
  useEffect(() => {
    const handleScroll = () => {
      const y = window.scrollY
      setNavbarShowing(!(y > lastScrollY.current && y > 80))
      lastScrollY.current = y
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // ── Data fetching ────────────────────────────────────────────────────────────
  const fetchDoctors = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/api/doctors`)
      if (!res.ok) throw new Error('Network error')
      const json = await res.json()
      if (json.success && Array.isArray(json.data)) {
        setDoctors(json.data)
        setTotalDoctors(json.meta?.total ?? json.data.length)
      } else {
        throw new Error('Invalid response shape')
      }
    } catch {
      setError('Unable to load doctors right now. Please check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchDoctors() }, [])

  // ── Derived data ─────────────────────────────────────────────────────────────
  const specializations = useMemo(() => {
    const specs = new Set(
      doctors.map(d => d.specialization).filter(Boolean)
    )
    return ['All', ...Array.from(specs).sort()]
  }, [doctors])

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    return doctors.filter(doc => {
      const matchesSearch =
        !q ||
        (doc.name || '').toLowerCase().includes(q) ||
        (doc.specialization || '').toLowerCase().includes(q)
      const matchesSpec =
        selectedSpec === 'All' || doc.specialization === selectedSpec
      return matchesSearch && matchesSpec
    })
  }, [doctors, searchQuery, selectedSpec])

  const isAvailable = (doc) =>
    doc.availability === 'Available' || doc.availability === true

  const getImageSrc = (doc) =>
    doc.imageUrl || `https://i.pravatar.cc/300?u=doctor-${doc.id}`

  const clearFilters = () => {
    setSearch('')
    setSpec('All')
  }

  const hasActiveFilters = searchQuery.trim() || selectedSpec !== 'All'

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen font-serif">
      <Navbar />

      {/* ── Page Hero ──────────────────────────────────────────────────────── */}
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
            Board-Certified Specialists
          </div>

          {/* Title */}
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight mb-4 font-[pacifico]">
            Meet Our{' '}
            <span className="text-transparent bg-clip-text bg-linear-to-r from-emerald-600 to-teal-500">
              Expert Doctors
            </span>
          </h1>

          <p className="text-lg text-gray-500 max-w-2xl mx-auto mb-10 leading-relaxed">
            Browse our directory of certified specialists. Find the right doctor,
            check their availability, and book your appointment in seconds.
          </p>

          {/* Stats row */}
          <div className="flex gap-10 sm:gap-16 justify-center flex-wrap">
            {[
              { value: totalDoctors !== null ? String(totalDoctors) : '…', label: 'Doctors' },
              { value: specializations.length > 1 ? String(specializations.length - 1) : '…', label: 'Specialties' },
              { value: '10K+', label: 'Patients Served' },
            ].map(({ value, label }) => (
              <div key={label} className="text-center">
                <div className="text-2xl sm:text-3xl font-bold text-emerald-700">{value}</div>
                <div className="text-xs text-gray-400 mt-1 uppercase tracking-wide">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Search & Filter Bar ─────────────────────────────────────────────── */}
      <section className={`bg-white py-6 border-b border-emerald-100 shadow-sm sticky z-30 transition-[top] duration-500 ${navbarShowing ? 'top-20' : 'top-0'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row gap-4 items-stretch sm:items-center">

          {/* Search input */}
          <div className="relative flex-1 sm:max-w-md">
            <Search
              className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-emerald-500 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="text"
              placeholder="Search by name or specialization…"
              value={searchQuery}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-12 pr-10 py-3 rounded-full border border-emerald-200 bg-white text-gray-800 placeholder-gray-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-300 transition-all text-sm"
              aria-label="Search doctors"
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

          {/* Specialization filter */}
          <div className="flex items-center gap-2">
            <SlidersHorizontal
              className="w-4 h-4 text-emerald-600 flex-shrink-0"
              aria-hidden="true"
            />
            <select
              value={selectedSpec}
              onChange={(e) => setSpec(e.target.value)}
              className="py-3 px-4 rounded-full border border-emerald-200 bg-white text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 transition-all text-sm w-full sm:w-52"
              aria-label="Filter by specialization"
            >
              {specializations.map(spec => (
                <option key={spec} value={spec}>{spec}</option>
              ))}
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

      {/* ── Doctors Grid ───────────────────────────────────────────────────── */}
      <section className="py-14 bg-linear-to-br from-emerald-50 to-teal-50 min-h-[50vh]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

          {/* Result count */}
          {!loading && !error && (
            <p className="text-sm text-emerald-700 font-medium mb-8">
              {filtered.length === 0
                ? 'No doctors found'
                : (
                  <>
                    Showing{' '}
                    <span className="font-bold text-emerald-800">{filtered.length}</span>
                    {' '}doctor{filtered.length !== 1 ? 's' : ''}
                    {selectedSpec !== 'All' && (
                      <span className="ml-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-xs font-semibold">
                        {selectedSpec}
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
                onClick={fetchDoctors}
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
              <div className="text-7xl mb-4">🔍</div>
              <h3 className="text-xl font-bold text-gray-700 mb-2">No Doctors Found</h3>
              <p className="text-gray-500 mb-6">
                {hasActiveFilters
                  ? 'Try adjusting your search or filter.'
                  : 'No doctors are listed at the moment.'}
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

          {/* ── Doctors Grid ── */}
          {!loading && !error && filtered.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {filtered.map((doc) => {
                const available = isAvailable(doc)
                const imageSrc  = getImageSrc(doc)

                return (
                  <article
                    key={doc.id}
                    className={`group bg-white rounded-3xl shadow-md hover:shadow-2xl transition-all duration-300 overflow-hidden flex flex-col${!available ? ' opacity-85' : ''}`}
                  >
                    {/* ── Doctor Image ── */}
                    <div className="relative h-52 overflow-hidden rounded-t-3xl">
                      <img
                        src={imageSrc}
                        alt={doc.name || 'Doctor'}
                        className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
                        onError={(e) => {
                          e.currentTarget.src = `https://i.pravatar.cc/300?u=doctor-${doc.id}`
                        }}
                      />
                      {/* Overlay gradient */}
                      <div className="absolute inset-0 bg-linear-to-t from-black/20 via-transparent to-transparent pointer-events-none" />

                      {/* Availability badge */}
                      <span
                        className={`absolute top-3 right-3 text-xs font-bold px-2.5 py-1 rounded-full shadow-sm border ${
                          available
                            ? 'bg-emerald-100/95 text-emerald-700 border-emerald-300'
                            : 'bg-rose-50/95 text-rose-700 border-rose-200'
                        }`}
                      >
                        {available ? '● Available' : '○ Unavailable'}
                      </span>
                    </div>

                    {/* ── Card Body ── */}
                    <div className="p-4 sm:p-5 flex flex-col gap-2 flex-1">

                      {/* Name */}
                      <h3 className="text-base sm:text-lg font-bold text-gray-900 leading-snug line-clamp-1">
                        {doc.name || 'Doctor'}
                      </h3>

                      {/* Specialization */}
                      <p className="text-sm text-emerald-600 font-semibold flex items-center gap-1.5">
                        <Stethoscope className="w-3.5 h-3.5 flex-shrink-0" />
                        {doc.specialization || 'General Practitioner'}
                      </p>

                      {/* Rating */}
                      {doc.rating > 0 && (
                        <div className="flex items-center gap-1.5">
                          <StarRating rating={doc.rating} />
                          <span className="text-xs text-gray-500 font-medium">
                            {doc.rating.toFixed(1)}
                          </span>
                        </div>
                      )}

                      {/* Fee + Experience chips */}
                      <div className="flex flex-wrap gap-1.5 mt-0.5">
                        <span className="flex items-center gap-1 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full text-green-700 font-bold text-xs">
                          ${doc.fee ?? 0} / visit
                        </span>
                        {doc.experience && (
                          <span className="flex items-center gap-1 bg-teal-50 border border-teal-100 px-2.5 py-1 rounded-full text-teal-700 text-xs font-medium">
                            <Award className="w-3 h-3" />
                            {doc.experience}
                          </span>
                        )}
                      </div>

                      {/* Location */}
                      {doc.location && (
                        <p className="text-xs text-gray-500 flex items-center gap-1 line-clamp-1">
                          <MapPin className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                          {doc.location}
                        </p>
                      )}

                      {/* Qualifications */}
                      {doc.qualifications && (
                        <p className="text-xs text-gray-400 italic line-clamp-1">
                          {doc.qualifications}
                        </p>
                      )}

                      {/* Patients / success info */}
                      {(doc.patients || doc.success) && (
                        <p className="text-xs text-gray-500 flex items-center gap-1 line-clamp-1">
                          <Users className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                          {doc.patients || doc.success}
                        </p>
                      )}

                      {/* Spacer to push button to bottom */}
                      <div className="flex-1" />

                      {/* ── Action Button ── */}
                      <div className="mt-3">
                        {available ? (
                          <Link
                            to={`/doctors/${doc.id}`}
                            className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-full font-semibold text-sm bg-linear-to-r from-emerald-500 to-teal-500 text-white hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"
                          >
                            <CalendarDays className="w-4 h-4" />
                            Book Appointment
                          </Link>
                        ) : (
                          <button
                            disabled
                            aria-disabled="true"
                            className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-full font-semibold text-sm bg-gray-200 text-gray-500 cursor-not-allowed"
                          >
                            <XCircle className="w-4 h-4" />
                            Not Available
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

      {/* ── CTA Section ────────────────────────────────────────────────────── */}
      {!loading && !error && (
        <section className={hs.ctaSection}>
          <div className={hs.ctaBg1} aria-hidden="true" />
          <div className={hs.ctaBg2} aria-hidden="true" />

          <div className={hs.ctaContainer}>
            <h2 className={hs.ctaTitle}>
              Can't Find the Right Doctor?
            </h2>
            <p className={hs.ctaSubtitle}>
              Our care team is here to help you find the perfect specialist.
              Contact us today or explore our full range of medical services.
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
      )}

      <Footer />
    </div>
  )
}

export default Doctors
