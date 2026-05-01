import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, XCircle } from 'lucide-react'
import { homeDoctorsStyles as s, homePageStyles as hs } from '../assets/dummyStyles'

const API_BASE = 'http://localhost:4000'
const PREVIEW_LIMIT = 4

const DoctorsPreview = () => {
  const [doctors, setDoctors] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchDoctors = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/api/doctors?limit=${PREVIEW_LIMIT}`)
      if (!res.ok) throw new Error('Network response was not ok')
      const json = await res.json()
      if (json.success && Array.isArray(json.data)) {
        setDoctors(json.data.slice(0, PREVIEW_LIMIT))
      } else {
        throw new Error('Invalid response shape')
      }
    } catch {
      setError('Unable to load doctors right now.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDoctors()
  }, [])

  const isAvailable = (doc) =>
    doc.availability === 'Available' || doc.availability === true

  return (
    <section className={s.section}>
      <div className={s.container}>

        {/* Header */}
        <div className={s.header}>
          <h2 className={s.title}>
            Meet Our{' '}
            <span className={s.titleSpan}>Specialist Doctors</span>
          </h2>
          <p className={s.subtitle}>
            Board-certified physicians dedicated to delivering compassionate,
            high-quality care for every patient.
          </p>
        </div>

        {/* Error state */}
        {error && (
          <div className={s.errorContainer}>
            <p className={s.errorText}>{error}</p>
            <button onClick={fetchDoctors} className={s.retryButton}>
              Retry
            </button>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className={s.skeletonGrid}>
            {Array.from({ length: PREVIEW_LIMIT }).map((_, i) => (
              <div key={i} className={s.skeletonCard}>
                <div className={s.skeletonImage} />
                <div className={s.skeletonText1} />
                <div className={s.skeletonText2} />
                <div className={s.skeletonButton} />
              </div>
            ))}
          </div>
        )}

        {/* Doctors grid */}
        {!loading && !error && (
          <div className={s.doctorsGrid}>
            {doctors.length === 0 ? (
              <p className={s.noResults}>No doctors found.</p>
            ) : (
              doctors.map((doc) => {
                const available = isAvailable(doc)
                const imageSrc =
                  doc.imageUrl ||
                  `https://i.pravatar.cc/300?u=doctor-${doc.id}`

                return (
                  <article key={doc.id} className={s.article}>
                    {/* Image */}
                    <div
                      className={
                        available
                          ? s.imageContainerAvailable
                          : s.imageContainerUnavailable
                      }
                    >
                      <img
                        src={imageSrc}
                        alt={doc.name || 'Doctor'}
                        className={s.image}
                        onError={(e) => {
                          e.currentTarget.src = `https://i.pravatar.cc/300?u=doctor-${doc.id}`
                        }}
                      />
                      {!available && (
                        <span className={s.unavailableBadge}>Unavailable</span>
                      )}
                    </div>

                    {/* Card body */}
                    <div className={s.cardBody}>
                      <h3 className={s.doctorName}>
                        {doc.name || 'Doctor'}
                      </h3>
                      <p className={s.specialization}>
                        {doc.specialization || 'General Practitioner'}
                      </p>

                      {/* Fee badge */}
                      <div className={s.experienceContainer}>
                        <span className={s.experienceBadge}>
                          ${doc.fee ?? 0} / visit
                        </span>
                      </div>

                      {/* Action button */}
                      <div className={s.buttonContainer}>
                        {available ? (
                          <Link
                            to={`/doctors/${doc.id}`}
                            className={s.buttonAvailable}
                          >
                            <CalendarDays className="w-4 h-4" />
                            Book Appointment
                          </Link>
                        ) : (
                          <button
                            className={s.buttonUnavailable}
                            disabled
                            aria-disabled="true"
                          >
                            <XCircle className="w-4 h-4" />
                            Not Available
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                )
              })
            )}
          </div>
        )}

        {/* View all link */}
        {!loading && !error && doctors.length > 0 && (
          <div className={hs.viewAllContainer}>
            <Link to="/doctors" className={hs.viewAllBtn}>
              View All Doctors →
            </Link>
          </div>
        )}
      </div>

      <style>{s.customCSS}</style>
    </section>
  )
}

export default DoctorsPreview
