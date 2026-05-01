import React, { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  CheckCircle, CalendarDays, Stethoscope, Clock, RefreshCw, AlertCircle,
} from 'lucide-react'

import Navbar from '../components/Navbar'
import Footer from '../components/Footer'

const API_BASE = 'http://localhost:4000'

const formatLongDate = (dateStr) => {
  if (!dateStr) return 'N/A'
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })
}

const AppointmentSuccess = () => {
  const [searchParams] = useSearchParams()
  const sessionId = searchParams.get('session_id')

  const [status,      setStatus]      = useState('loading') // 'loading' | 'success' | 'error'
  const [appointment, setAppointment] = useState(null)
  const [errMsg,      setErrMsg]      = useState('')

  useEffect(() => {
    if (!sessionId) {
      setErrMsg('No payment session found. This confirmation link may be invalid or expired.')
      setStatus('error')
      return
    }

    const confirmPayment = async () => {
      try {
        const res  = await fetch(`${API_BASE}/api/appointments/confirm?session_id=${sessionId}`)
        const json = await res.json()
        if (json.success && json.data) {
          setAppointment(json.data)
          setStatus('success')
        } else {
          setErrMsg(json.message || 'Payment confirmation failed. The session may have expired.')
          setStatus('error')
        }
      } catch {
        setErrMsg('Network error. Please check your connection and try again.')
        setStatus('error')
      }
    }

    confirmPayment()
  }, [sessionId])

  return (
    <div className="min-h-screen font-serif bg-linear-to-br from-emerald-50 via-white to-teal-50">
      <Navbar />

      <main className="flex items-center justify-center py-24 px-4">
        <div className="max-w-lg w-full">

          {/* ── Loading ── */}
          {status === 'loading' && (
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-emerald-100 mb-6">
                <RefreshCw className="w-9 h-9 text-emerald-600 animate-spin" />
              </div>
              <h2 className="text-2xl font-bold text-gray-800 mb-2">Confirming Payment…</h2>
              <p className="text-gray-500">Please wait while we confirm your appointment payment.</p>
            </div>
          )}

          {/* ── Success ── */}
          {status === 'success' && (
            <div className="bg-white rounded-3xl shadow-xl p-8 text-center border border-emerald-100">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-emerald-100 mb-6">
                <CheckCircle className="w-10 h-10 text-emerald-600" />
              </div>

              <h2 className="text-2xl font-bold text-gray-900 mb-2 font-[pacifico]">
                Payment Successful!
              </h2>
              <p className="text-gray-500 mb-7 leading-relaxed">
                Your doctor appointment has been confirmed and payment received.
                We look forward to seeing you!
              </p>

              {/* Appointment summary */}
              {appointment && (
                <div className="bg-emerald-50 rounded-2xl p-5 text-left space-y-3 mb-7 border border-emerald-100">
                  <div className="flex items-start gap-2.5 text-sm text-gray-700">
                    <Stethoscope className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold">{appointment.doctorName || 'Doctor'}</span>
                      {appointment.speciality && (
                        <span className="text-emerald-600 font-medium"> · {appointment.speciality}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 text-sm text-gray-700">
                    <CalendarDays className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <span>{formatLongDate(appointment.date)}</span>
                  </div>

                  <div className="flex items-center gap-2.5 text-sm text-gray-700">
                    <Clock className="w-4 h-4 text-teal-500 flex-shrink-0" />
                    <span>{appointment.time || 'N/A'}</span>
                  </div>

                  <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700 bg-emerald-100 rounded-xl px-3 py-2">
                    <span>✓</span>
                    <span>
                      Amount Paid: ${appointment.payment?.amount ?? appointment.fees ?? 0}
                    </span>
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link
                  to="/appointments"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3 rounded-full bg-linear-to-r from-emerald-500 to-teal-500 text-white font-semibold hover:shadow-lg hover:-translate-y-0.5 transition-all shadow-md"
                >
                  <CalendarDays className="w-4 h-4" />
                  View My Appointments
                </Link>
                <Link
                  to="/"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3 rounded-full border border-emerald-200 text-emerald-700 font-semibold hover:bg-emerald-50 transition-all"
                >
                  Go to Home
                </Link>
              </div>
            </div>
          )}

          {/* ── Error ── */}
          {status === 'error' && (
            <div className="bg-white rounded-3xl shadow-xl p-8 text-center border border-rose-100">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-rose-100 mb-6">
                <AlertCircle className="w-10 h-10 text-rose-500" />
              </div>

              <h2 className="text-2xl font-bold text-gray-900 mb-2">Confirmation Failed</h2>
              <p className="text-gray-500 mb-8 leading-relaxed">{errMsg}</p>

              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link
                  to="/appointments"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3 rounded-full bg-linear-to-r from-emerald-500 to-teal-500 text-white font-semibold hover:shadow-lg transition-all shadow-md"
                >
                  <CalendarDays className="w-4 h-4" />
                  View My Appointments
                </Link>
                <Link
                  to="/doctors"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3 rounded-full border border-emerald-200 text-emerald-700 font-semibold hover:bg-emerald-50 transition-all"
                >
                  Browse Doctors
                </Link>
              </div>
            </div>
          )}

        </div>
      </main>

      <Footer />
    </div>
  )
}

export default AppointmentSuccess
