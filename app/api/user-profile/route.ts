import { NextRequest, NextResponse } from 'next/server'
import { getMemoryPrimer, ensureSessionMemoryHydrated, getHydrationDiagnostics, getSessionMemorySnapshot } from '@/lib/data'
import { primeNetlifyBlobContextFromHeaders } from '@/lib/blob'
import { normalizeHandle } from '@/lib/user-scope'

// Topic definitions for progress tracking
const TOPIC_DEFINITIONS = [
  { id: 'childhood', label: 'Childhood', keywords: [/born/i, /birth/i, /child/i, /parent/i, /sibling/i, /home/i, /grew up/i, /mother/i, /father/i, /mom/i, /dad/i], icon: '💛' },
  { id: 'education', label: 'Education', keywords: [/school/i, /class/i, /teacher/i, /friend/i, /college/i, /university/i, /study/i, /student/i, /learn/i], icon: '📚' },
  { id: 'career', label: 'Work & Career', keywords: [/job/i, /work/i, /career/i, /business/i, /office/i, /company/i, /boss/i, /profession/i, /retire/i], icon: '💼' },
  { id: 'family', label: 'Family Life', keywords: [/married/i, /spouse/i, /wife/i, /husband/i, /wedding/i, /son/i, /daughter/i, /family/i], icon: '👨‍👩‍👧‍👦' },
  { id: 'culture', label: 'Culture & Traditions', keywords: [/tradition/i, /culture/i, /festival/i, /holiday/i, /religion/i, /community/i, /language/i, /food/i], icon: '🎭' },
  { id: 'wisdom', label: 'Wisdom & Advice', keywords: [/advice/i, /lesson/i, /wisdom/i, /regret/i, /proud/i, /hope/i, /legacy/i, /message/i], icon: '💡' },
]

type TopicProgressResult = {
  id: string
  label: string
  icon: string
  mentions: number
  snippets: string[]
}

function splitSentences(text: string): string[] {
  return text
    .replace(/[\r\n]+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 12)
}

function countTopicMentions(text: string): TopicProgressResult[] {
  const sentences = splitSentences(text)
  return TOPIC_DEFINITIONS.map((topic) => {
    let count = 0
    const matched: string[] = []
    for (const keyword of topic.keywords) {
      const matches = text.match(new RegExp(keyword, 'gi'))
      if (matches) count += matches.length
    }
    for (const sentence of sentences) {
      if (matched.length >= 3) break
      if (topic.keywords.some(kw => kw.test(sentence))) {
        const trimmed = sentence.length > 140 ? sentence.slice(0, 139) + '\u2026' : sentence
        matched.push(trimmed)
      }
    }
    return {
      id: topic.id,
      label: topic.label,
      icon: topic.icon,
      mentions: count,
      snippets: matched,
    }
  })
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
      console.error('[user-profile] Hydration failed:', err)
    }
  }

  try {
    const primer = await getMemoryPrimer(handle)

    // Get sessions for topic analysis
    const { sessions } = getSessionMemorySnapshot(undefined, { handle })
    const allUserText = sessions
      .flatMap((session) =>
        session.turns
          .filter((turn) => turn.role === 'user' && turn.text)
          .map((turn) => turn.text)
      )
      .join(' ')

    // Calculate topic progress
    const topicProgress = countTopicMentions(allUserText)
    const maxMentions = Math.max(...topicProgress.map((t) => t.mentions), 1)
    // Only count sessions that have actual conversation turns (exclude stale/abandoned)
    const activeSessions = sessions.filter((s) => s.total_turns > 0)
    const sessionCount = activeSessions.length
    const totalTurns = activeSessions.reduce((sum, s) => sum + s.total_turns, 0)

    if (!primer.text || primer.text.trim().length === 0) {
      return NextResponse.json({
        ok: true,
        hasProfile: false,
        handle: handle || null,
        profile: null,
        topicProgress: {
          topics: topicProgress,
          maxMentions,
          sessionCount,
          totalTurns,
        },
        message: 'No profile data yet. Complete some sessions to build your profile.'
      })
    }

    // Parse the markdown primer into structured sections
    const sections = parsePrimerMarkdown(primer.text)

    return NextResponse.json({
      ok: true,
      hasProfile: true,
      handle: handle || null,
      profile: {
        raw: primer.text,
        sections,
        updatedAt: primer.updatedAt || null,
      },
      topicProgress: {
        topics: topicProgress,
        maxMentions,
        sessionCount,
        totalTurns,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load profile'
    console.error('[user-profile] Error:', message)
    return NextResponse.json({
      ok: false,
      error: message,
      handle: handle || null,
      profile: null,
    }, { status: 500 })
  }
}

type ProfileSection = {
  title: string
  highlights: string[]
  archived: string[]
}

function parsePrimerMarkdown(text: string): ProfileSection[] {
  const sections: ProfileSection[] = []
  const lines = text.split('\n')

  let currentSection: ProfileSection | null = null
  let inHighlights = false
  let inArchived = false

  for (const line of lines) {
    const trimmed = line.trim()

    // Section header (## Title)
    if (trimmed.startsWith('## ')) {
      if (currentSection) {
        sections.push(currentSection)
      }
      currentSection = {
        title: trimmed.slice(3).trim(),
        highlights: [],
        archived: [],
      }
      inHighlights = false
      inArchived = false
      continue
    }

    // Subsection headers
    if (trimmed.startsWith('### ')) {
      const sub = trimmed.slice(4).toLowerCase()
      if (sub.includes('highlight') || sub.includes('latest')) {
        inHighlights = true
        inArchived = false
      } else if (sub.includes('archive') || sub.includes('older')) {
        inHighlights = false
        inArchived = true
      }
      continue
    }

    // List items
    if (currentSection && trimmed.startsWith('- ')) {
      const item = trimmed.slice(2).replace(/^\*\*Latest:\*\*\s*/i, '').trim()
      if (item.length > 0) {
        if (inHighlights) {
          currentSection.highlights.push(item)
        } else if (inArchived) {
          currentSection.archived.push(item)
        } else {
          // Default to highlights if no subsection specified
          currentSection.highlights.push(item)
        }
      }
    }
  }

  if (currentSection) {
    sections.push(currentSection)
  }

  // Filter out empty sections
  return sections.filter(s => s.highlights.length > 0 || s.archived.length > 0)
}
