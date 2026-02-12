/**
 * Conversation Digest — a dense, cumulative summary of all sessions for a user.
 *
 * At the end of every session, an AI-generated summary is appended to the digest.
 * At the start of every session, the digest is injected into the agent's context
 * so it "remembers" the full history of all past conversations.
 *
 * Stored at: memory/digests/{handle}.json
 */

import { putBlobFromBuffer, readBlob } from '@/lib/blob'
import { normalizeHandle } from '@/lib/user-scope'

// ---------- types ----------

export type SessionSummary = {
  sessionId: string
  date: string
  turnCount: number
  durationMs: number
  /** AI-generated 2-4 sentence summary of what was discussed */
  summary: string
  /** Key facts/details learned (names, places, dates, stories) */
  keyFacts: string[]
  /** Life topics touched on */
  topics: string[]
}

export type ConversationDigest = {
  handle: string
  updatedAt: string
  totalSessions: number
  /** One-paragraph narrative of everything known about this person */
  overallNarrative: string
  /** Per-session summaries, newest first */
  sessions: SessionSummary[]
}

// ---------- paths ----------

function digestPathForHandle(handle: string | null | undefined): string {
  const normalized = normalizeHandle(handle) || 'unassigned'
  return `memory/digests/${normalized}.json`
}

// ---------- read / write ----------

export async function getDigest(handle: string | null | undefined): Promise<ConversationDigest | null> {
  try {
    const blob = await readBlob(digestPathForHandle(handle))
    if (!blob) return null
    const text = blob.buffer.toString('utf8')
    return JSON.parse(text) as ConversationDigest
  } catch {
    return null
  }
}

async function saveDigest(digest: ConversationDigest): Promise<void> {
  const path = digestPathForHandle(digest.handle)
  const json = JSON.stringify(digest, null, 2)
  await putBlobFromBuffer(path, Buffer.from(json, 'utf8'), 'application/json', { access: 'public' })
}

// ---------- AI summarization ----------

type TurnForSummary = {
  role: 'user' | 'assistant'
  text: string
}

function buildSummarizationPrompt(turns: TurnForSummary[], existingNarrative: string): string {
  const transcript = turns
    .map(t => `${t.role === 'user' ? 'Person' : 'Interviewer'}: ${t.text}`)
    .join('\n')

  return `You are analyzing a recorded family interview conversation. Your job is to create a dense factual summary.

${existingNarrative ? `EXISTING KNOWLEDGE ABOUT THIS PERSON:\n${existingNarrative}\n` : ''}
TRANSCRIPT OF THIS SESSION:
${transcript}

Respond with JSON only (no code fences). Format:
{
  "summary": "2-4 sentence summary of what was discussed and learned in this session",
  "keyFacts": ["fact 1", "fact 2", ...],
  "topics": ["topic1", "topic2"],
  "updatedNarrative": "Updated 1-paragraph narrative incorporating both old knowledge and new. Cover: who this person is, key life events, family members mentioned, places, career, values, stories told. Be factual and dense — pack in as many concrete details as possible. Max 500 words."
}

Rules:
- keyFacts should be specific, concrete details (names, dates, places, relationships, stories)
- topics should be from: childhood, education, career, family, culture, wisdom, health, places, relationships
- updatedNarrative should weave ALL known facts into a single coherent paragraph
- If the conversation was very short or just greetings, still extract what you can
- Be factual, not flowery. Pack maximum information into minimum words.`
}

async function callGeminiForSummary(prompt: string): Promise<{
  summary: string
  keyFacts: string[]
  topics: string[]
  updatedNarrative: string
} | null> {
  const apiKey = process.env.GOOGLE_API_KEY?.trim()
  if (!apiKey) return null

  const model = process.env.GOOGLE_MODEL?.trim() || 'gemini-2.0-flash'

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3 },
        }),
      },
    )

    if (!response.ok) return null

    const json = await response.json()
    const text = json?.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p?.text || '')
      .filter(Boolean)
      .join('\n') || ''

    // Parse JSON from response (handle code fences)
    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    const parsed = JSON.parse(cleaned)

    return {
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      keyFacts: Array.isArray(parsed.keyFacts) ? parsed.keyFacts.filter((f: unknown) => typeof f === 'string') : [],
      topics: Array.isArray(parsed.topics) ? parsed.topics.filter((t: unknown) => typeof t === 'string') : [],
      updatedNarrative: typeof parsed.updatedNarrative === 'string' ? parsed.updatedNarrative : '',
    }
  } catch {
    return null
  }
}

// ---------- fallback (no-AI) summarization ----------

function buildFallbackSummary(turns: TurnForSummary[]): { summary: string; keyFacts: string[]; topics: string[] } {
  const userText = turns
    .filter(t => t.role === 'user' && t.text.trim().length > 10)
    .map(t => t.text.trim())

  if (!userText.length) {
    return { summary: 'Brief or empty session.', keyFacts: [], topics: [] }
  }

  // Take the first few substantial user utterances as summary
  const combined = userText.slice(0, 3).join(' ').replace(/\s+/g, ' ').trim()
  const summary = combined.length > 300 ? combined.slice(0, 299) + '\u2026' : combined

  // Simple topic detection
  const TOPIC_KEYWORDS: Record<string, RegExp[]> = {
    childhood: [/born/i, /child/i, /grew up/i, /parent/i, /mother/i, /father/i],
    education: [/school/i, /college/i, /university/i, /teacher/i],
    career: [/job/i, /work/i, /career/i, /business/i, /retire/i],
    family: [/married/i, /wife/i, /husband/i, /son/i, /daughter/i, /family/i],
    culture: [/tradition/i, /culture/i, /religion/i, /food/i, /holiday/i],
    wisdom: [/advice/i, /lesson/i, /regret/i, /proud/i, /hope/i],
  }
  const allText = userText.join(' ')
  const topics = Object.entries(TOPIC_KEYWORDS)
    .filter(([, patterns]) => patterns.some(p => p.test(allText)))
    .map(([topic]) => topic)

  return { summary, keyFacts: [], topics }
}

// ---------- public API ----------

export async function updateDigestAfterSession(
  handle: string | null | undefined,
  sessionId: string,
  turns: TurnForSummary[],
  metadata: { date: string; turnCount: number; durationMs: number },
): Promise<ConversationDigest> {
  const existing = await getDigest(handle)
  const normalizedHandle = normalizeHandle(handle) || 'unassigned'

  // Don't re-summarize a session that's already in the digest
  if (existing?.sessions.some(s => s.sessionId === sessionId)) {
    return existing
  }

  const existingNarrative = existing?.overallNarrative || ''

  // Try AI summarization, fall back to keyword-based
  const aiResult = await callGeminiForSummary(
    buildSummarizationPrompt(turns, existingNarrative),
  )

  const fallback = aiResult ? null : buildFallbackSummary(turns)

  const sessionSummary: SessionSummary = {
    sessionId,
    date: metadata.date,
    turnCount: metadata.turnCount,
    durationMs: metadata.durationMs,
    summary: aiResult?.summary || fallback?.summary || '',
    keyFacts: aiResult?.keyFacts || fallback?.keyFacts || [],
    topics: aiResult?.topics || fallback?.topics || [],
  }

  const updatedNarrative = aiResult?.updatedNarrative || existingNarrative || sessionSummary.summary

  const digest: ConversationDigest = {
    handle: normalizedHandle,
    updatedAt: new Date().toISOString(),
    totalSessions: (existing?.totalSessions || 0) + 1,
    overallNarrative: updatedNarrative,
    sessions: [sessionSummary, ...(existing?.sessions || [])],
  }

  await saveDigest(digest).catch((err) => {
    console.error('[conversation-digest] Failed to save digest:', err)
  })

  return digest
}

/**
 * Build a compact text representation of the digest for injection into AI context.
 * This is what gets sent to the agent at the start of every turn.
 */
export function formatDigestForContext(digest: ConversationDigest | null): string {
  if (!digest) return ''

  const lines: string[] = []
  lines.push('=== CONVERSATION HISTORY DIGEST ===')
  lines.push(`Sessions recorded: ${digest.totalSessions}`)
  lines.push('')

  if (digest.overallNarrative) {
    lines.push('WHO THIS PERSON IS:')
    lines.push(digest.overallNarrative)
    lines.push('')
  }

  // Include last 10 session summaries for recency context
  const recentSessions = digest.sessions.slice(0, 10)
  if (recentSessions.length) {
    lines.push('RECENT SESSION SUMMARIES:')
    for (const session of recentSessions) {
      const dateLabel = session.date
        ? new Date(session.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : 'Unknown date'
      lines.push(`[${dateLabel}] ${session.summary}`)
      if (session.keyFacts.length) {
        lines.push(`  Facts: ${session.keyFacts.join('; ')}`)
      }
    }
    lines.push('')
  }

  // Collect all unique key facts across all sessions
  const allFacts = new Set<string>()
  for (const session of digest.sessions) {
    for (const fact of session.keyFacts) {
      allFacts.add(fact)
    }
  }
  if (allFacts.size > 0) {
    lines.push('ALL KNOWN FACTS:')
    for (const fact of allFacts) {
      lines.push(`- ${fact}`)
    }
    lines.push('')
  }

  lines.push('=== END DIGEST ===')
  return lines.join('\n')
}
