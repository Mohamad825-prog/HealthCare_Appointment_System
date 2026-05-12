import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useUser } from '@clerk/clerk-react'
import { AlertCircle, Loader2, Search, Stethoscope } from 'lucide-react'

const API_BASE = 'http://localhost:4000'

const initialForm = {
  department: '',
  preferredLanguage: '',
  genderPreference: '',
  preferredDate: '',
  preferredTimePeriod: '',
}

const departments = [
  'General Medicine',
  'Cardiology',
  'Dermatology',
  'Dentistry',
  'ENT',
  'Gynecological Diseases',
  'Kidneys and Urinary Tract',
  'Neurology',
  'Nutritionist',
  'Ophthalmology',
  'Orthopedics',
  'Pediatrician',
  'Pediatrics',
]

const DoctorRecommendationHelper = () => {
  const { user } = useUser()
  const [form, setForm] = useState(initialForm)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (!form.department.trim()) {
      setResult(null)
      setError('Please choose a department first.')
      return
    }

    setLoading(true)
    setError('')
    setResult(null)

    try {
      const response = await fetch(`${API_BASE}/api/ai/recommend-doctors`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...form,
          patientId: user?.id || '',
        }),
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Unable to recommend doctors right now.')
      }

      setResult(data)
    } catch (err) {
      setError(
        err.message || 'Unable to recommend doctors right now. Please try again.'
      )
    } finally {
      setLoading(false)
    }
  }

  const recommendations = result?.recommendations || []

  return (
    <section className="bg-white py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full bg-blue-100 px-4 py-2 text-sm font-semibold text-blue-700">
            <Stethoscope className="h-4 w-4" />
            Rule-based doctor matching
          </span>
          <h2 className="mt-5 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Find the Best Doctor for You
          </h2>
          <p className="mt-4 text-base leading-7 text-slate-600">
            Tell us your preferences and we will suggest the best doctor
            matches.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
          <form
            onSubmit={handleSubmit}
            className="rounded-lg border border-slate-200 bg-slate-50 p-5 shadow-sm sm:p-6"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label
                  htmlFor="department"
                  className="block text-sm font-semibold text-slate-800"
                >
                  Department
                </label>
                <select
                  id="department"
                  value={form.department}
                  onChange={(event) =>
                    updateField('department', event.target.value)
                  }
                  className="mt-2 w-full rounded-md border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                >
                  <option value="">Choose a department</option>
                  {departments.map((department) => (
                    <option key={department} value={department}>
                      {department}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="preferredLanguage"
                  className="block text-sm font-semibold text-slate-800"
                >
                  Preferred language
                </label>
                <input
                  id="preferredLanguage"
                  type="text"
                  value={form.preferredLanguage}
                  onChange={(event) =>
                    updateField('preferredLanguage', event.target.value)
                  }
                  className="mt-2 w-full rounded-md border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  placeholder="Arabic, English..."
                />
              </div>

              <div>
                <label
                  htmlFor="genderPreference"
                  className="block text-sm font-semibold text-slate-800"
                >
                  Gender preference
                </label>
                <select
                  id="genderPreference"
                  value={form.genderPreference}
                  onChange={(event) =>
                    updateField('genderPreference', event.target.value)
                  }
                  className="mt-2 w-full rounded-md border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                >
                  <option value="">No preference</option>
                  <option value="Female">Female</option>
                  <option value="Male">Male</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="preferredDate"
                  className="block text-sm font-semibold text-slate-800"
                >
                  Preferred date
                </label>
                <input
                  id="preferredDate"
                  type="date"
                  value={form.preferredDate}
                  onChange={(event) =>
                    updateField('preferredDate', event.target.value)
                  }
                  className="mt-2 w-full rounded-md border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
              </div>

              <div>
                <label
                  htmlFor="preferredTimePeriod"
                  className="block text-sm font-semibold text-slate-800"
                >
                  Time period
                </label>
                <select
                  id="preferredTimePeriod"
                  value={form.preferredTimePeriod}
                  onChange={(event) =>
                    updateField('preferredTimePeriod', event.target.value)
                  }
                  className="mt-2 w-full rounded-md border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                >
                  <option value="">Any time</option>
                  <option value="morning">Morning</option>
                  <option value="afternoon">Afternoon</option>
                  <option value="evening">Evening</option>
                </select>
              </div>
            </div>

            {error && (
              <div className="mt-4 flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-none" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300 sm:w-auto"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              {loading ? 'Finding matches...' : 'Recommend Doctors'}
            </button>
          </form>

          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            {!result && (
              <div className="flex h-full min-h-64 items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center">
                <p className="max-w-sm text-sm leading-6 text-slate-500">
                  Your recommended doctors will appear here after you submit
                  your preferences.
                </p>
              </div>
            )}

            {result && (
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  {result.message}
                </p>

                {recommendations.length === 0 ? (
                  <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    No doctor recommendations were found. Try choosing another
                    department or browse doctors manually.
                  </div>
                ) : (
                  <div className="mt-4 space-y-4">
                    {recommendations.map((doctor) => (
                      <article
                        key={doctor.id}
                        className="rounded-lg border border-slate-200 p-4 transition hover:border-blue-200 hover:bg-blue-50/40"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <h3 className="text-lg font-bold text-slate-900">
                              {doctor.name}
                            </h3>
                            <p className="text-sm font-medium text-blue-700">
                              {doctor.specialization || 'Specialist Doctor'}
                            </p>
                          </div>
                          <span className="w-fit rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700">
                            Score {doctor.score}
                          </span>
                        </div>

                        {doctor.reasons.length > 0 && (
                          <ul className="mt-3 space-y-2">
                            {doctor.reasons.map((reason) => (
                              <li
                                key={reason}
                                className="flex gap-2 text-sm leading-6 text-slate-600"
                              >
                                <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-blue-500" />
                                <span>{reason}</span>
                              </li>
                            ))}
                          </ul>
                        )}

                        <div className="mt-4">
                          <Link
                            to={`/doctors/${doctor.id}`}
                            className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
                          >
                            View Doctor
                          </Link>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

export default DoctorRecommendationHelper
