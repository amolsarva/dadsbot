import { NextRequest, NextResponse } from 'next/server'
import { getMemoryPrimer, ensureSessionMemoryHydrated, getHydrationDiagnostics } from '@/lib/data'
import { primeNetlifyBlobContextFromHeaders } from '@/lib/blob'
import { normalizeHandle } from '@/lib/user-scope'

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

    if (!primer.text || primer.text.trim().length === 0) {
      return NextResponse.json({
        ok: true,
        hasProfile: false,
        handle: handle || null,
        profile: null,
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
      }
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
