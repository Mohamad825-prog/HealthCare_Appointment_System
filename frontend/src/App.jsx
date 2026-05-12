import React, { useEffect, useLayoutEffect, useRef } from 'react'
import { Routes, Route, Navigate, useLocation, useNavigationType } from 'react-router-dom'
import Home from './pages/Home'
import Doctors from './pages/Doctors'
import Services from './pages/Services'
import Appointments from './pages/Appointments'
import Contact from './pages/Contact'
import DoctorDetail from './pages/DoctorDetail'
import ServiceDetail from './pages/ServiceDetail'
import Profile from './pages/Profile'
import AppointmentSuccess from './pages/AppointmentSuccess'
import AppointmentCancel from './pages/AppointmentCancel'
import ServiceAppointmentSuccess from './pages/ServiceAppointmentSuccess'
import ServiceAppointmentCancel from './pages/ServiceAppointmentCancel'
import DoctorLogin from './pages/DoctorLogin'
import DoctorDashboard from './pages/DoctorDashboard'
import DoctorProtectedRoute from './components/DoctorProtectedRoute'

const SCROLL_STORAGE_KEY = 'frontend-scroll-positions-v1'

const loadStoredPositions = () => {
  if (typeof window === 'undefined') return {}

  try {
    const raw = window.sessionStorage.getItem(SCROLL_STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

const persistPositions = (positions) => {
  try {
    window.sessionStorage.setItem(
      SCROLL_STORAGE_KEY,
      JSON.stringify(positions)
    )
  } catch {
    // Ignore storage failures so navigation keeps working.
  }
}

const isReloadNavigation = () => {
  if (typeof window === 'undefined') return false

  const navigationEntry = window.performance
    ?.getEntriesByType?.('navigation')
    ?.at(0)

  if (navigationEntry?.type) {
    return navigationEntry.type === 'reload'
  }

  return window.performance?.navigation?.type === 1
}

const ScrollManager = () => {
  const { key } = useLocation()
  const navigationType = useNavigationType()
  const positions = useRef(loadStoredPositions())
  const shouldForceTopOnLoad = useRef(isReloadNavigation())

  useEffect(() => {
    if (!('scrollRestoration' in window.history)) return undefined

    const previousScrollRestoration = window.history.scrollRestoration
    window.history.scrollRestoration = 'manual'

    return () => {
      window.history.scrollRestoration = previousScrollRestoration
    }
  }, [])

  useEffect(() => {
    const saveScrollPosition = () => {
      positions.current[key] = window.scrollY
      persistPositions(positions.current)
    }

    window.addEventListener('pagehide', saveScrollPosition)

    return () => {
      saveScrollPosition()
      window.removeEventListener('pagehide', saveScrollPosition)
    }
  }, [key])

  useLayoutEffect(() => {
    let frameId = 0

    const restoreScroll = (targetY, attempt = 0) => {
      const maxScrollY = Math.max(
        document.documentElement.scrollHeight - window.innerHeight,
        0
      )
      const nextY = Math.min(targetY, maxScrollY)

      window.scrollTo(0, nextY)

      if (nextY === targetY || attempt >= 20) return

      frameId = window.requestAnimationFrame(() =>
        restoreScroll(targetY, attempt + 1)
      )
    }

    frameId = window.requestAnimationFrame(() => {
      if (!shouldForceTopOnLoad.current && navigationType === 'POP') {
        const savedPosition = positions.current[key]

        if (typeof savedPosition === 'number') {
          restoreScroll(savedPosition)
          return
        }
      }

      shouldForceTopOnLoad.current = false
      window.scrollTo(0, 0)
    })

    return () => window.cancelAnimationFrame(frameId)
  }, [key, navigationType])

  return null
}

const App = () => {
  return (
    <div>
      <ScrollManager />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/doctors" element={<Doctors />} />
        <Route path="/doctors/:id" element={<DoctorDetail />} />
        <Route path="/services" element={<Services />} />
        <Route path="/services/:id" element={<ServiceDetail />} />
        <Route path="/appointments" element={<Appointments />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/appointment/success" element={<AppointmentSuccess />} />
        <Route path="/appointment/cancel" element={<AppointmentCancel />} />
        <Route path="/service-appointment/success" element={<ServiceAppointmentSuccess />} />
        <Route path="/service-appointment/cancel" element={<ServiceAppointmentCancel />} />
        <Route path="/doctor-admin" element={<Navigate to="/doctor-admin/login" replace />} />
        <Route path="/doctor-admin/login" element={<DoctorLogin />} />
        <Route
          path="/doctor-admin/dashboard"
          element={
            <DoctorProtectedRoute>
              <DoctorDashboard />
            </DoctorProtectedRoute>
          }
        />
      </Routes>
    </div>
  )
}

export default App
