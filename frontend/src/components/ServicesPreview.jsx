import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, XCircle } from 'lucide-react'
import {
  serviceCardStyles as sc,
  servicePageStyles as sp,
  homePageStyles as hs,
} from '../assets/dummyStyles'

const API_BASE = 'http://localhost:4000'
const PREVIEW_LIMIT = 4

const ServicesPreview = () => {
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchServices = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/api/services`)
      if (!res.ok) throw new Error('Network response was not ok')
      const json = await res.json()
      if (json.success && Array.isArray(json.data)) {
        setServices(json.data.slice(0, PREVIEW_LIMIT))
      } else {
        throw new Error('Invalid response shape')
      }
    } catch {
      setError('Unable to load services right now.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchServices()
  }, [])

  const fallbackImage = (name) =>
    `https://placehold.co/400x240/d1fae5/059669?text=${encodeURIComponent(
      name || 'Service'
    )}`

  return (
    <section className={hs.servicesSection}>
      <div className={hs.servicesContainer}>

        {/* Header */}
        <div className={hs.servicesHeader}>
          <h2 className={hs.sectionTitle}>
            Our Medical{' '}
            <span className={hs.sectionTitleSpan}>Services</span>
          </h2>
          <p className={hs.sectionSubtitle}>
            Comprehensive healthcare services designed to address every aspect
            of your well-being.
          </p>
        </div>

        {/* Error state */}
        {error && (
          <div className={sp.errorContainer}>
            <p className={sp.errorText}>{error}</p>
            <button onClick={fetchServices} className={sp.retryButton}>
              Retry
            </button>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className={sp.skeletonGrid}>
            {Array.from({ length: PREVIEW_LIMIT }).map((_, i) => (
              <div key={i} className={sp.skeletonCard}>
                <div className={sp.skeletonImage} />
                <div className={sp.skeletonText1} />
                <div className={sp.skeletonText2} />
                <div className={sp.skeletonButton} />
              </div>
            ))}
          </div>
        )}

        {/* Services grid */}
        {!loading && !error && (
          <div className={sp.servicesGrid}>
            {services.length === 0 ? (
              <p className={sp.emptyState}>No services available yet.</p>
            ) : (
              services.map((svc) => {
                const imgSrc = svc.imageUrl || fallbackImage(svc.name)
                const isAvailable = svc.available !== false

                return (
                  <div key={svc.id} className={sc.card}>
                    {/* Image */}
                    <div className={sc.imageContainer}>
                      <img
                        src={imgSrc}
                        alt={svc.name || 'Service'}
                        className={sc.responsiveImage}
                        onError={(e) => {
                          e.currentTarget.src = fallbackImage(svc.name)
                        }}
                      />
                    </div>

                    {/* Content */}
                    <div className={sc.content}>
                      <h3 className={sc.serviceName}>
                        {svc.name || 'Service'}
                      </h3>

                      {(svc.shortDescription || svc.about) && (
                        <p className="text-gray-500 text-sm mt-1 line-clamp-2 leading-relaxed">
                          {svc.shortDescription || svc.about}
                        </p>
                      )}

                      {svc.price > 0 && (
                        <p className="text-emerald-700 font-bold text-base mt-2">
                          ${svc.price}
                        </p>
                      )}

                      <div className={sc.buttonContainer}>
                        {isAvailable ? (
                          <Link
                            to={`/services/${svc.id}`}
                            className={sc.buttonAvailable}
                          >
                            <CalendarDays className="w-4 h-4" />
                            Book Now
                          </Link>
                        ) : (
                          <button
                            className={sc.buttonUnavailable}
                            disabled
                            aria-disabled="true"
                          >
                            <XCircle className="w-4 h-4" />
                            Unavailable
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}

        {/* View all link */}
        {!loading && !error && services.length > 0 && (
          <div className={hs.viewAllContainer}>
            <Link to="/services" className={hs.viewAllBtn}>
              View All Services →
            </Link>
          </div>
        )}
      </div>
    </section>
  )
}

export default ServicesPreview
