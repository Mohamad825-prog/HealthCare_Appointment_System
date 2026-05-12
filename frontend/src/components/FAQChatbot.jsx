import React, { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertCircle,
  Bot,
  CalendarCheck,
  ExternalLink,
  Loader2,
  MessageSquare,
  RotateCcw,
  Send,
  Sparkles,
  UserRound,
} from 'lucide-react'

const API_BASE = 'http://localhost:4000'

const initialQuickReplies = [
  'Book an appointment',
  'Find a doctor',
  'Show services',
  'How do I pay?',
]

const createMessage = (role, text, extra = {}) => ({
  id: `${Date.now()}-${Math.random()}`,
  role,
  text,
  createdAt: new Date().toISOString(),
  ...extra,
})

const createInitialMessages = () => [
  createMessage(
    'bot',
    'Hi! I can help with bookings, cancellations, rescheduling, payments, doctors, services, account access, and appointment status. I can also look up current doctors and services from the platform.',
    {
      category: 'General',
      confidence: 1,
      quickReplies: initialQuickReplies,
      actions: [
        { label: 'Browse Doctors', href: '/doctors' },
        { label: 'Browse Services', href: '/services' },
      ],
    }
  ),
]

const formatTime = (value) =>
  new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))

const getLatestBotMessage = (messages) =>
  [...messages].reverse().find((message) => message.role === 'bot')

const getCardIcon = (type) =>
  type === 'service' ? (
    <CalendarCheck className="h-4 w-4" />
  ) : (
    <UserRound className="h-4 w-4" />
  )

const FAQChatbot = () => {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState(createInitialMessages)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesContainerRef = useRef(null)

  const latestBotMessage = getLatestBotMessage(messages)
  const quickReplies = latestBotMessage?.quickReplies?.length
    ? latestBotMessage.quickReplies
    : initialQuickReplies

  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return

    container.scrollTo({
      top: container.scrollHeight,
      behavior: 'smooth',
    })
  }, [messages, loading])

  const sendMessage = async (messageText) => {
    const trimmedMessage = messageText.trim()
    if (!trimmedMessage || loading) {
      if (!trimmedMessage) setError('Please type a question first.')
      return
    }

    const userMessage = createMessage('user', trimmedMessage)
    const historyPayload = messages.slice(-8).map((message) => ({
      role: message.role,
      text: message.text,
      intent: message.intent || '',
    }))

    setMessages((current) => [...current, userMessage])
    setInput('')
    setError('')
    setLoading(true)

    try {
      const response = await fetch(`${API_BASE}/api/ai/faq-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: trimmedMessage,
          history: historyPayload,
        }),
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Unable to get a reply right now.')
      }

      setMessages((current) => [
        ...current,
        createMessage('bot', data.reply, {
          intent: data.intent,
          category: data.category,
          confidence: data.confidence,
          quickReplies: data.quickReplies || [],
          actions: data.actions || [],
          cards: data.cards || [],
        }),
      ])
    } catch (err) {
      setError(err.message || 'Unable to get a reply right now.')
      setMessages((current) => [
        ...current,
        createMessage(
          'bot',
          'Sorry, I could not answer right now. Please try again in a moment or use the Contact page for support.',
          {
            category: 'Support',
            quickReplies: ['Contact support', 'Browse doctors', 'Show services'],
            actions: [{ label: 'Contact Support', href: '/contact' }],
          }
        ),
      ])
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    sendMessage(input)
  }

  const handleReset = () => {
    setMessages(createInitialMessages())
    setInput('')
    setError('')
  }

  return (
    <section className="bg-slate-50 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full bg-teal-100 px-4 py-2 text-sm font-semibold text-teal-700">
              <MessageSquare className="h-4 w-4" />
              Smart FAQ chatbot
            </span>
            <h2 className="mt-5 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              Need Help?
            </h2>
            <p className="mt-4 text-base leading-7 text-slate-600">
              Ask about booking, payments, doctors, services, or managing your appointments.
            </p>
          </div>

          <button
            type="button"
            onClick={handleReset}
            className="inline-flex w-fit items-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-teal-200 hover:text-teal-700"
          >
            <RotateCcw className="h-4 w-4" />
            Reset Chat
          </button>
        </div>

        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  Patient Support Assistant
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Database-aware answers with quick next steps.
                </p>
              </div>
              <span className="inline-flex w-fit items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">
                <Sparkles className="h-3.5 w-3.5" />
                Live platform context
              </span>
            </div>
          </div>

          <div
            ref={messagesContainerRef}
            className="h-[34rem] overflow-y-auto bg-slate-50 px-4 py-5 sm:px-6"
          >
            <div className="space-y-5">
              {messages.map((message) => {
                const isUser = message.role === 'user'

                return (
                  <div
                    key={message.id}
                    className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
                  >
                    {!isUser && (
                      <div className="mt-1 flex h-9 w-9 flex-none items-center justify-center rounded-full bg-teal-600 text-white">
                        <Bot className="h-5 w-5" />
                      </div>
                    )}

                    <div
                      className={`max-w-[88%] rounded-lg px-4 py-3 text-sm leading-6 shadow-sm sm:max-w-[78%] ${
                        isUser
                          ? 'bg-slate-900 text-white'
                          : 'bg-white text-slate-700 ring-1 ring-slate-200'
                      }`}
                    >
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wide opacity-75">
                          {isUser ? 'You' : message.category || 'Assistant'}
                        </span>
                        <span className="text-xs opacity-60">
                          {formatTime(message.createdAt)}
                        </span>
                        {!isUser && message.confidence ? (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                            {Math.round(message.confidence * 100)}% match
                          </span>
                        ) : null}
                      </div>

                      <p className="whitespace-pre-line">{message.text}</p>

                      {!isUser && message.cards?.length ? (
                        <div className="mt-4 grid gap-3">
                          {message.cards.map((card) => (
                            <Link
                              key={`${card.type}-${card.href}-${card.title}`}
                              to={card.href}
                              className="block rounded-md border border-slate-200 bg-slate-50 p-3 transition hover:border-teal-200 hover:bg-teal-50"
                            >
                              <div className="flex items-start gap-3">
                                <span className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-md bg-white text-teal-700 ring-1 ring-slate-200">
                                  {getCardIcon(card.type)}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="font-semibold text-slate-900">
                                        {card.title}
                                      </p>
                                      <p className="mt-0.5 text-xs text-slate-500">
                                        {card.subtitle}
                                      </p>
                                    </div>
                                    <ExternalLink className="h-4 w-4 flex-none text-slate-400" />
                                  </div>

                                  {card.badges?.length ? (
                                    <div className="mt-3 flex flex-wrap gap-2">
                                      {card.badges.map((badge) => (
                                        <span
                                          key={badge}
                                          className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200"
                                        >
                                          {badge}
                                        </span>
                                      ))}
                                    </div>
                                  ) : null}

                                  {card.details?.length ? (
                                    <div className="mt-3 space-y-1 text-xs text-slate-500">
                                      {card.details.map((detail) => (
                                        <p key={detail}>{detail}</p>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            </Link>
                          ))}
                        </div>
                      ) : null}

                      {!isUser && message.actions?.length ? (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {message.actions.map((action) => (
                            <Link
                              key={`${action.href}-${action.label}`}
                              to={action.href}
                              className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-teal-700"
                            >
                              {action.label}
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Link>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    {isUser && (
                      <div className="mt-1 flex h-9 w-9 flex-none items-center justify-center rounded-full bg-slate-900 text-white">
                        <UserRound className="h-5 w-5" />
                      </div>
                    )}
                  </div>
                )
              })}

              {loading && (
                <div className="flex justify-start gap-3">
                  <div className="mt-1 flex h-9 w-9 flex-none items-center justify-center rounded-full bg-teal-600 text-white">
                    <Bot className="h-5 w-5" />
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-3 text-sm text-slate-600 shadow-sm ring-1 ring-slate-200">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Checking the platform...</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-slate-200 bg-white px-4 py-4 sm:px-6">
            <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
              {quickReplies.map((reply) => (
                <button
                  key={reply}
                  type="button"
                  onClick={() => sendMessage(reply)}
                  disabled={loading}
                  className="flex-none rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {reply}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row">
              <input
                type="text"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Ask about appointments, payments, doctors, services, or availability..."
                className="w-full rounded-md border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
              />
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-teal-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-teal-300"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {loading ? 'Sending...' : 'Send'}
              </button>
            </form>

            {error && (
              <div className="mt-3 flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-none" />
                <span>{error}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

export default FAQChatbot
