import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseSessionClient } from '@/lib/session-store'
import { PersonProfile } from '@/lib/person-facts'

/**
 * GET /api/person-profile?sessionId=X&handle=Y
 *
 * Fetch the person profile for a given session.
 * Returns the profile extracted from the session's conversation.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionId = request.nextUrl.searchParams.get('sessionId')
    const handle = request.nextUrl.searchParams.get('handle')

    if (!sessionId || !handle) {
      return NextResponse.json(
        { error: 'Missing required parameters: sessionId and handle' },
        { status: 400 }
      )
    }

    const supabase = getSupabaseSessionClient()

    // Fetch the session record from Supabase
    const sessionsTable = process.env.SUPABASE_SESSIONS_TABLE
    if (!sessionsTable) {
      return NextResponse.json(
        { error: 'Server misconfigured: SUPABASE_SESSIONS_TABLE not set' },
        { status: 500 }
      )
    }

    const { data: session, error: sessionError } = await supabase
      .from(sessionsTable)
      .select('*')
      .eq('id', sessionId)
      .eq('user_handle', handle)
      .single()

    if (sessionError || !session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      )
    }

    // Extract person profile from artifacts
    // For now, artifacts might not have person_profile, so we'll return what we have
    const artifacts = session.artifacts || {}
    const personProfile: PersonProfile | null = artifacts.person_profile ? JSON.parse(artifacts.person_profile) : null

    if (!personProfile) {
      // Return a minimal profile if none exists yet
      return NextResponse.json({
        handle,
        updatedAt: session.created_at,
        extractedFrom: {
          totalTurns: session.total_turns || 0,
          topicsDiscussed: artifacts.topics_discussed ? JSON.parse(artifacts.topics_discussed) : [],
        },
      })
    }

    return NextResponse.json(personProfile)
  } catch (error) {
    console.error('Error fetching person profile:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
