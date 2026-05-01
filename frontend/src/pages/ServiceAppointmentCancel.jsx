import React from 'react'
import { Link } from 'react-router-dom'
import { XCircle, CalendarDays, Activity } from 'lucide-react'

import Navbar from '../components/Navbar'
import Footer from '../components/Footer'

const ServiceAppointmentCancel = () => {
  return (
    <div className="min-h-screen font-serif bg-linear-to-br from-rose-50 via-white to-orange-50">
      <Navbar />

      <main className="flex items-center justify-center py-24 px-4">
        <div className="max-w-lg w-full">
          <div className="bg-white rounded-3xl shadow-xl p-8 text-center border border-rose-100">

            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-rose-100 mb-6">
              <XCircle className="w-10 h-10 text-rose-500" />
            </div>

            <h2 className="text-2xl font-bold text-gray-900 mb-2 font-[pacifico]">
              Payment Canceled
            </h2>
            <p className="text-gray-500 mb-7 leading-relaxed">
              Your payment was not completed. Your service appointment booking has not been
              confirmed, and no charges were made to your account.
            </p>

            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 mb-7 text-left">
              <p className="text-sm font-semibold text-amber-700 mb-2">What happens next?</p>
              <ul className="text-sm text-amber-600 space-y-1.5 list-disc list-inside">
                <li>Your appointment reservation may still be pending</li>
                <li>You can try booking again from the Services page</li>
                <li>No charges have been applied to your account</li>
                <li>Contact our support team if you need further assistance</li>
              </ul>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                to="/services"
                className="inline-flex items-center justify-center gap-2 px-7 py-3 rounded-full bg-linear-to-r from-emerald-500 to-teal-500 text-white font-semibold hover:shadow-lg hover:-translate-y-0.5 transition-all shadow-md"
              >
                <Activity className="w-4 h-4" />
                Try Again
              </Link>
              <Link
                to="/appointments"
                className="inline-flex items-center justify-center gap-2 px-7 py-3 rounded-full border border-emerald-200 text-emerald-700 font-semibold hover:bg-emerald-50 transition-all"
              >
                <CalendarDays className="w-4 h-4" />
                My Appointments
              </Link>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}

export default ServiceAppointmentCancel
