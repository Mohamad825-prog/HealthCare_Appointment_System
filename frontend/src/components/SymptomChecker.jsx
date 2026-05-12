import React, { useState } from 'react'
import { AlertCircle, Loader2, Search, Sparkles } from 'lucide-react'

const API_BASE = 'http://localhost:4000'

const SymptomChecker = () => {
  const [symptoms, setSymptoms] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()

    const trimmedSymptoms = symptoms.trim()
    if (!trimmedSymptoms) {
      setResult(null)
      setError('Please describe your symptoms first.')
      return
    }

    setLoading(true)
    setError('')
    setResult(null)

    try {
      const response = await fetch(`${API_BASE}/api/ai/symptom-check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ symptoms: trimmedSymptoms }),
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Unable to check symptoms right now.')
      }

      setResult(data)
    } catch (err) {
      setError(
        err.message || 'Unable to check symptoms right now. Please try again.'
      )
    } finally {
      setLoading(false)
    }
  }

  const topSuggestion = result?.topSuggestion
  const alternatives =
    result?.suggestions?.filter(
      (suggestion) => suggestion.department !== topSuggestion?.department
    ) || []

  return (
    <section className="bg-slate-50 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-start gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-4 py-2 text-sm font-semibold text-emerald-700">
              <Sparkles className="h-4 w-4" />
              Smart patient helper
            </span>
            <h2 className="mt-5 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              Find the Right Department
            </h2>
            <p className="mt-4 max-w-xl text-base leading-7 text-slate-600">
              Describe your symptoms and get a quick department suggestion
              before browsing doctors.
            </p>
            <p className="mt-4 max-w-xl rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
              This suggestion is for guidance only and does not replace medical
              advice.
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="symptoms"
                  className="block text-sm font-semibold text-slate-800"
                >
                  Your symptoms
                </label>
                <textarea
                  id="symptoms"
                  value={symptoms}
                  onChange={(event) => setSymptoms(event.target.value)}
                  rows={4}
                  className="mt-2 w-full resize-none rounded-md border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                  placeholder="Example: headache and fever"
                />
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 flex-none" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300 sm:w-auto"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                {loading ? 'Checking...' : 'Suggest Department'}
              </button>
            </form>

            {result && (
              <div className="mt-6 rounded-lg border border-emerald-100 bg-emerald-50 p-5">
                {topSuggestion ? (
                  <>
                    <p className="text-sm font-medium text-emerald-700">
                      Top suggestion
                    </p>
                    <h3 className="mt-1 text-2xl font-bold text-slate-900">
                      {topSuggestion.department}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-slate-700">
                      {result.message}
                    </p>

                    {alternatives.length > 0 && (
                      <div className="mt-5 border-t border-emerald-200 pt-4">
                        <p className="text-sm font-semibold text-slate-800">
                          Alternative suggestions
                        </p>
                        <div className="mt-3 space-y-2">
                          {alternatives.map((suggestion) => (
                            <div
                              key={suggestion.department}
                              className="rounded-md bg-white px-4 py-3 text-sm text-slate-700 ring-1 ring-emerald-100"
                            >
                              <span className="font-semibold text-slate-900">
                                {suggestion.department}
                              </span>
                              <span className="text-slate-500">
                                {' '}
                                - matched {suggestion.matchedKeywords.join(', ')}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex items-start gap-3">
                    <AlertCircle className="mt-1 h-5 w-5 flex-none text-amber-600" />
                    <p className="text-sm leading-6 text-slate-700">
                      {result.message}
                    </p>
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

export default SymptomChecker
