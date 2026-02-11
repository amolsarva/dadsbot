import { NextRequest, NextResponse } from 'next/server'
import { ensureSessionMemoryHydrated, getHydrationDiagnostics, getSessionMemorySnapshot } from '@/lib/data'
import { primeNetlifyBlobContextFromHeaders } from '@/lib/blob'
import { normalizeHandle } from '@/lib/user-scope'

// Topic definitions matching the interview guide stages
// This API provides topic coverage analysis for the home page progress meters
const TOPIC_DEFINITIONS = [
  {
    id: 'childhood',
    label: 'Childhood',
    keywords: [/born/i, /birth/i, /child/i, /parent/i, /sibling/i, /neighbou?r/i, /home/i, /grew up/i, /mother/i, /father/i, /mom/i, /dad/i],
    icon: '💒',
  },
  {
    id: 'education',
    label: 'Education',
    keywords: [/school/i, /class/i, /teacher/i, /friend/i, /college/i, /university/i, /study/i, /student/i, /learn/i, /grade/i],
    icon: '📚',
  },
  {
    id: 'career',
    label: 'Work & Career',
    keywords: [/job/i, /work/i, /career/i, /business/i, /office/i, /company/i, /boss/i, /colleague/i, /profession/i, /retire/i],
    icon: '💼',
  },
  {
    id: 'family',
    label: 'Family Life',
    keywords: [/married/i, /spouse/i, /wife/i, /husband/i, /wedding/i, /child/i, /son/i, /daughter/i, /family/i, /household/i],
    icon: '👨‍👩‍👧‍👦',
  },
  {
    id: 'culture',
    label: 'Culture & Traditions',
    keywords: [/tradition/i, /culture/i, /festival/i, /holiday/i, /religion/i, /community/i, /language/i, /food/i, /music/i, /dance/i],
    icon: '🎭',
  },
  {
    id: 'wisdom',
    label: 'Wisdom & Advice',
    keywords: [/advice/i, /lesson/i, /learn/i, /wisdom/i, /regret/i, /proud/i, /hope/i, /legacy/i, /message/i, /remember/i],
    icon: '💡',
  },
]

type TopicProgress = {
  id: string
  label: string
  icon: string
  mentions: number
  snippets: string[]
}

function countTopicMentions(text: string): Map<string, number> {
  const counts = new Map<string, number>()
  for (const topic of TOPIC_DEFINITIONS) {
    let count = 0
    for (const keyword of topic.keywords) {
      const matches = text.match(keyword)
      if (matches) {
        count += matches.length
      }
    }
    counts.set(topic.id, count)
  }
  return counts
}

function extractSnippets(text: string, topicId: string): string[] {
  const topic = TOPIC_DEFINITIONS.find((t) => t.id === topicId)
  if (!topic) return []

  const sentences = text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .filter((s) => s.length >= 20)

  const matches: string[] = []
  for (const sentence of sentences) {
    if (topic.keywords.some((kw) => kw.test(sentence))) {
      const trimmed = sentence.length > 80 ? sentence.slice(0, 77) + '...' : sentence
      matches.push(trimmed)
      if (matches.length >= 3) break
    }
  }
  return matches
}

export async function GET(req: NextRequest) {
  primeNetlifyBlobContextFromHeaders(req.headers)

  const url = new URL(req.url)
  const rawHandle = url.searchParams.get('handle')
  const handle = normalizeHandle(rawHandle)

  // Ensure session data is hydrated
  const hydration = getHydrationDiagnostics()
  if (!hydration.hydrated) {
    try {
      await ensureSessionMemoryHydrated()
    } catch (err) {
      console.error('[topic-progress] Hydration failed:', err)
    }
  }

  // Get all sessions for this user
  const { sessions } = getSessionMemorySnapshot(undefined, { handle })

  // Combine all user turns into one text blob for analysis
  const allUserText = sessions
    .flatMap((session) =>
      session.turns
        .filter((turn) => turn.role === 'user' && turn.text)
        .map((turn) => turn.text)
    )
    .join(' ')

  // Count mentions for each topic
  const mentionCounts = countTopicMentions(allUserText)

  // Find the max mentions to calculate relative progress
  const maxMentions = Math.max(...Array.from(mentionCounts.values()), 1)

  // Build the progress data
  const topics: TopicProgress[] = TOPIC_DEFINITIONS.map((topic) => {
    const mentions = mentionCounts.get(topic.id) || 0
    const snippets = extractSnippets(allUserText, topic.id)
    return {
      id: topic.id,
      label: topic.label,
      icon: topic.icon,
      mentions,
      snippets,
    }
  })

  // Calculate total turns across all sessions
  const totalTurns = sessions.reduce((sum, s) => sum + s.total_turns, 0)

  return NextResponse.json({
    ok: true,
    handle: handle || null,
    sessionCount: sessions.length,
    totalTurns,
    maxMentions,
    topics,
  })
}
