import { NextRequest, NextResponse } from 'next/server'
import {
  ensureSessionMemoryHydrated,
  getHydrationDiagnostics,
  getMemoryPrimer,
  getSessionMemorySnapshot,
  getSession,
} from '@/lib/data'
import { primeNetlifyBlobContextFromHeaders } from '@/lib/blob'
import { collectAskedQuestions, findLatestUserDetails, normalizeQuestion, pickFallbackQuestion } from '@/lib/question-memory'
import {
  formatIntroGreeting,
  formatIntroReminder,
  getIntroInvitation,
  getIntroQuestion,
} from '@/lib/fallback-texts'
import { resolveGoogleModel } from '@/lib/google'
import { getDigest, formatDigestForContext } from '@/lib/conversation-digest'

const INTRO_SYSTEM_PROMPT = `You are DadsBot, a warm and curious conversation partner helping someone capture their family stories and life memories.

Your approach: Be gently DIRECTED - suggest a specific topic to explore rather than leaving it open-ended. This reduces cognitive load on the person.

For first-time users:
- Introduce yourself warmly and briefly
- Suggest a SPECIFIC topic to start with: "I'd love to learn about your mom" or "Let's start with where you grew up"
- Ask a concrete opening question: "What was her name?" or "What was your hometown like?"

For returning users:
- Welcome them back warmly
- Look at the "suggested topics" below to find something you haven't explored yet
- Suggest that topic naturally: "Last time we talked about your career. Today I'm curious about your childhood - where did you grow up?"
- Ask a specific, easy-to-answer question to get started

Guidelines:
- Keep it under 80 words
- Be warm and curious, not formal or clinical
- ALWAYS suggest a specific topic and ask a concrete question
- Make it easy for them - they shouldn't have to think about what to share
- If they want to talk about something else, that's perfectly fine - follow their lead

Respond with JSON: {"message":"<your greeting>","question":"<your question>"}. No code fences.`

type DiagnosticLevel = 'log' | 'error'

const introHypotheses = [
  'GOOGLE_API_KEY may be unset for intro generation.',
  'GOOGLE_MODEL might be missing or blank.',
  'Session memory could be incomplete, leading to fallback copy.',
]

function introTimestamp() {
  return new Date().toISOString()
}

function introEnvSummary() {
  return {
    googleApiKey: process.env.GOOGLE_API_KEY ? 'set' : 'missing',
    googleModel: process.env.GOOGLE_MODEL ?? null,
  }
}

function logIntro(level: DiagnosticLevel, step: string, payload: Record<string, unknown> = {}) {
  const entry = {
    ...payload,
    envSummary: introEnvSummary(),
  }
  const message = `[diagnostic] ${introTimestamp()} ${step} ${JSON.stringify(entry)}`
  if (level === 'error') {
    console.error(message)
  } else {
    console.log(message)
  }
}

function buildFallbackIntro(options: {
  titles: string[]
  details: string[]
  question: string
  hasHistory: boolean
}): string {
  const { titles, details, question, hasHistory } = options
  const introPrefix = formatIntroGreeting({ hasHistory, titles })
  const reminder = formatIntroReminder(details)
  const invitation = getIntroInvitation(hasHistory)
  const closingQuestion = getIntroQuestion(hasHistory, question)
  return `${introPrefix} ${reminder} ${invitation} ${closingQuestion}`.trim()
}

// Topics to explore - for suggesting direction
const SUGGESTED_TOPICS = [
  { id: 'mother', label: 'Mother/Mom', keywords: ['mother', 'mom', 'mama', 'mum'], question: "What was your mother's name? Tell me about her." },
  { id: 'father', label: 'Father/Dad', keywords: ['father', 'dad', 'papa', 'daddy'], question: "What was your father's name? What was he like?" },
  { id: 'childhood', label: 'Childhood home', keywords: ['grew up', 'childhood', 'hometown', 'born'], question: 'Where did you grow up? What was it like there?' },
  { id: 'siblings', label: 'Brothers & Sisters', keywords: ['brother', 'sister', 'sibling'], question: 'Did you have brothers or sisters? Tell me about them.' },
  { id: 'school', label: 'School days', keywords: ['school', 'teacher', 'class', 'education'], question: 'What was school like for you? Any memorable teachers?' },
  { id: 'career', label: 'Work & Career', keywords: ['job', 'work', 'career', 'profession'], question: 'What kind of work did you do? How did you get into that?' },
  { id: 'marriage', label: 'Marriage & Partner', keywords: ['married', 'wife', 'husband', 'wedding', 'spouse'], question: 'How did you meet your spouse? Tell me about that.' },
  { id: 'children', label: 'Children', keywords: ['son', 'daughter', 'child', 'kids'], question: 'Tell me about your children. What are some of your favorite memories with them?' },
  { id: 'traditions', label: 'Family traditions', keywords: ['tradition', 'holiday', 'celebration', 'festival'], question: 'What traditions or holidays were special in your family?' },
  { id: 'lessons', label: 'Life lessons', keywords: ['lesson', 'advice', 'wisdom', 'learned'], question: "What's something important that life has taught you?" },
]

function findSuggestedTopics(historyText: string): string[] {
  const lowerHistory = historyText.toLowerCase()
  const uncovered = SUGGESTED_TOPICS.filter((topic) => {
    // Check if any keyword appears in the history
    return !topic.keywords.some((kw) => lowerHistory.includes(kw))
  })
  // Return 2-3 suggested topics that haven't been covered
  return uncovered.slice(0, 3).map((t) => `${t.label}: "${t.question}"`)
}

function buildHistorySummary(
  titles: string[],
  details: string[],
  askedQuestions: string[],
  primerText: string,
): { historyText: string; questionText: string; suggestedTopics: string } {
  const historyLines: string[] = []
  if (titles.length) {
    historyLines.push('Session titles remembered:')
    for (const title of titles.slice(0, 5)) {
      historyLines.push(`- ${title}`)
    }
  }
  if (details.length) {
    historyLines.push('Recent user details:')
    for (const detail of details.slice(0, 5)) {
      historyLines.push(`- ${detail}`)
    }
  }
  const historyText = historyLines.join('\n') || 'No previous transcript details are available yet.'

  const uniqueQuestions: string[] = []
  const seen = new Set<string>()
  for (const question of askedQuestions) {
    const normalized = normalizeQuestion(question)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    uniqueQuestions.push(question)
    if (uniqueQuestions.length >= 12) break
  }

  const questionLines = uniqueQuestions.length
    ? ['Avoid repeating these prior questions:', ...uniqueQuestions.map((question) => `- ${question}`)]
    : ['No prior questions are on record.']

  // Find topics that haven't been explored yet
  const combinedContext = `${historyText} ${primerText}`.toLowerCase()
  const suggested = findSuggestedTopics(combinedContext)
  const suggestedTopics = suggested.length
    ? `SUGGESTED TOPICS TO EXPLORE (pick one of these to suggest):\n${suggested.map((s) => `- ${s}`).join('\n')}`
    : 'All major topics have been touched on. You can revisit any area for more depth.'

  return { historyText, questionText: questionLines.join('\n'), suggestedTopics }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  primeNetlifyBlobContextFromHeaders(req.headers)
  const sessionId = params.id
  logIntro('log', 'session-intro:request:start', {
    sessionId,
    hypotheses: introHypotheses,
    hydration: getHydrationDiagnostics(),
  })

  const hydrationBefore = getHydrationDiagnostics()
  if (!hydrationBefore.attempted || !hydrationBefore.hydrated) {
    logIntro('log', 'session-intro:hydration:pending', { sessionId, hydration: hydrationBefore })
    try {
      await ensureSessionMemoryHydrated()
      logIntro('log', 'session-intro:hydration:completed', {
        sessionId,
        hydration: getHydrationDiagnostics(),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'session hydration failed'
      logIntro('error', 'session-intro:hydration:error', {
        sessionId,
        hydration: getHydrationDiagnostics(),
        message,
        stack: error instanceof Error ? error.stack : undefined,
      })
    }
  } else {
    logIntro('log', 'session-intro:hydration:already-complete', { sessionId, hydration: hydrationBefore })
  }

  let { current, sessions } = getSessionMemorySnapshot(sessionId)

  // If session not found in memory, try fetching directly from database
  // This handles race conditions where session was just created
  if (!current) {
    const maxRetries = 1
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        logIntro('log', 'session-intro:not-in-memory:fetching-from-db', {
          sessionId,
          attempt: attempt + 1,
          maxAttempts: maxRetries + 1,
        })
        const freshSession = await getSession(sessionId)
        if (freshSession) {
          current = {
            ...freshSession,
            turns: Array.isArray(freshSession.turns) ? freshSession.turns : [],
          }
          sessions = [current]
          logIntro('log', 'session-intro:recovered-from-db', {
            sessionId,
            recoveryAttempt: attempt + 1,
          })
          break
        }
      } catch (err) {
        lastError = err instanceof Error ? err : new Error('Unknown error')
        if (attempt < maxRetries) {
          // Wait before retrying with exponential backoff
          await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt)))
          logIntro('log', 'session-intro:db-fetch-retry', {
            sessionId,
            attempt: attempt + 1,
            nextRetryMs: 100 * Math.pow(2, attempt + 1),
          })
        }
      }
    }

    if (!current && lastError) {
      logIntro('log', 'session-intro:db-fetch-exhausted', {
        sessionId,
        finalError: lastError.message,
        attemptsExhausted: true,
      })
    }
  }

  if (!current) {
    const hydration = getHydrationDiagnostics()
    logIntro('error', 'session-intro:session-not-found', {
      sessionId,
      hydration,
      sessionCount: hydration.sessionCount,
      hydrationErrors: hydration.errors,
    })
    return NextResponse.json({ ok: false, error: 'session_not_found' }, { status: 404 })
  }

  const previousSessions = sessions.filter((session) => session.id !== sessionId)
  const titles = previousSessions
    .map((session) => session.title)
    .filter((title): title is string => Boolean(title && title.trim().length))
    .slice(0, 5)
  const details = findLatestUserDetails(sessions, { excludeSessionId: sessionId, limit: 3 })
  const askedQuestions = collectAskedQuestions(sessions)
  const fallbackQuestion = pickFallbackQuestion(askedQuestions, details[0])
  const fallbackMessage = buildFallbackIntro({
    titles,
    details,
    question: fallbackQuestion,
    hasHistory: previousSessions.length > 0,
  })
  const primer = await getMemoryPrimer(current.user_handle ?? null).catch(() => ({ text: '' }))
  const primerText = primer && typeof primer === 'object' && 'text' in primer && primer.text ? String(primer.text) : ''

  const debug = {
    hasPriorSessions: previousSessions.length > 0,
    sessionCount: sessions.length,
    rememberedTitles: titles,
    rememberedDetails: details,
    askedQuestionsPreview: askedQuestions.slice(0, 10),
    primerPreview: primerText.slice(0, 400),
    primerHandle: current.user_handle ?? null,
    fallbackQuestion,
  }

  const googleApiKey = process.env.GOOGLE_API_KEY ? process.env.GOOGLE_API_KEY.trim() : ''
  if (!googleApiKey) {
    const message = 'GOOGLE_API_KEY is required for intro generation.'
    logIntro('error', 'session-intro:google:missing-api-key', { sessionId, message })
    return NextResponse.json({ ok: false, error: 'missing_google_api_key', message }, { status: 500 })
  }

  let model: string
  try {
    model = resolveGoogleModel(process.env.GOOGLE_MODEL)
    logIntro('log', 'session-intro:google:model-resolved', { sessionId, model })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unable to resolve Google model. Set GOOGLE_MODEL to a supported Gemini model.'
    logIntro('error', 'session-intro:google:model-resolution-failed', { sessionId, message })
    return NextResponse.json({ ok: false, error: 'missing_google_model', message }, { status: 500 })
  }

  try {
    const { historyText, questionText, suggestedTopics } = buildHistorySummary(titles, details, askedQuestions, primerText)
    const parts: any[] = [{ text: INTRO_SYSTEM_PROMPT }]
    const digest = await getDigest(current.user_handle ?? null).catch(() => null)
    const digestText = formatDigestForContext(digest)
    if (digestText) {
      parts.push({ text: digestText })
    }
    if (primerText.trim().length) {
      parts.push({ text: `Memory primer:\n${primerText.slice(0, 6000)}` })
    }
    parts.push({ text: historyText })
    parts.push({ text: questionText })
    parts.push({ text: suggestedTopics })
    parts.push({ text: 'Respond only with JSON in the format {"message":"...","question":"..."}. Remember to suggest a SPECIFIC topic and ask a CONCRETE question.' })

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${googleApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts }] }),
      },
    )

    const json = await response.json().catch(() => ({}))
    const txt =
      json?.candidates?.[0]?.content?.parts?.map((part: any) => part?.text || '').filter(Boolean).join('\n') || ''
    const providerStatus = response.status
    const providerErrorMessage =
      typeof json?.error?.message === 'string'
        ? json.error.message
        : typeof json?.error === 'string'
        ? json.error
        : !response.ok
        ? response.statusText || 'Provider request failed'
        : null
    const providerResponseSnippet = (txt && txt.trim().length
      ? txt
      : JSON.stringify(json?.error || json) || '').slice(0, 400)

    let message = ''
    try {
      const cleaned = txt.trim().replace(/^```(json)?/i, '').replace(/```$/i, '')
      const parsed = JSON.parse(cleaned)
      if (parsed && typeof parsed.message === 'string') {
        message = parsed.message.trim()
        // Include the question from the AI response if present
        if (parsed.question && typeof parsed.question === 'string') {
          const q = parsed.question.trim()
          if (q && !message.includes(q)) {
            message = `${message} ${q}`.trim()
          }
        }
      }
    } catch {
      message = txt.trim()
    }

    // Only use fallback if AI completely failed to respond
    if (!message) {
      logIntro('error', 'session-intro:google:empty-response', {
        sessionId,
        providerStatus,
        providerError: providerErrorMessage,
        providerResponseSnippet,
      })
      // Simple, honest fallback - no forced question
      const simpleFallback = previousSessions.length > 0
        ? "Welcome back. I'm ready to continue whenever you are. What would you like to talk about?"
        : "Hi, I'm DadsBot. I'm here to help you capture and preserve your family stories. What memory would you like to share?"
      return NextResponse.json({ ok: true, message: simpleFallback, fallback: true, debug })
    }

    logIntro('log', 'session-intro:google:success', {
      sessionId,
      providerStatus,
      providerError: providerErrorMessage,
    })
    return NextResponse.json({ ok: true, message, fallback: false, debug })
  } catch (error: any) {
    const reason = typeof error?.message === 'string' ? error.message : 'intro_failed'
    logIntro('error', 'session-intro:provider:exception', { sessionId, reason })
    return NextResponse.json({ ok: true, message: fallbackMessage, fallback: true, reason, debug })
  }
}
