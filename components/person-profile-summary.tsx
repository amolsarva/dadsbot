'use client'

import { useEffect, useState } from 'react'
import type { PersonProfile } from '@/lib/person-facts'

interface PersonProfileSummaryProps {
  handle: string | null
  sessionId: string
}

export function PersonProfileSummary({ handle, sessionId }: PersonProfileSummaryProps) {
  const [profile, setProfile] = useState<PersonProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [_error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!handle || !sessionId) {
      setLoading(false)
      return
    }

    const fetchProfile = async () => {
      try {
        setLoading(true)
        setError(null)

        const response = await fetch(
          `/api/person-profile?sessionId=${encodeURIComponent(sessionId)}&handle=${encodeURIComponent(handle)}`
        )

        if (!response.ok) {
          throw new Error(`Failed to fetch profile: ${response.statusText}`)
        }

        const data = await response.json()
        setProfile(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
        console.error('Error fetching person profile:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchProfile()
  }, [sessionId, handle])

  if (!handle) {
    return null
  }

  if (loading) {
    return (
      <div className="person-profile-summary person-profile-summary--loading">
        <div className="spinner">Loading profile…</div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="person-profile-summary person-profile-summary--empty">
        <p className="person-profile-summary__empty-message">No profile data yet</p>
      </div>
    )
  }

  return (
    <div className="person-profile-summary">
      <h2 className="person-profile-summary__title">
        PROFILE: Who is {profile.fullName || 'this person'}?
      </h2>

      <div className="person-profile-summary__divider" />

      <ul className="person-profile-summary__facts">
        {profile.birthplace && profile.currentLocation && (
          <li>
            Born in {profile.birthplace}, moved to {profile.currentLocation}
          </li>
        )}
        {!profile.birthplace && profile.currentLocation && (
          <li>Lives in {profile.currentLocation}</li>
        )}

        {profile.profession && (
          <li>
            Works as {profile.profession}
            {profile.yearsExperience ? `, ${profile.yearsExperience} years experience` : ''}
          </li>
        )}

        {profile.family && <li>Family: {profile.family}</li>}

        {profile.personalityTraits && profile.personalityTraits.length > 0 && (
          <li>Personality: {profile.personalityTraits.join(', ')}</li>
        )}

        {profile.memorableStories && profile.memorableStories.length > 0 && (
          <li>Memorable: {profile.memorableStories[0]}</li>
        )}

        {profile.currentFocus && profile.currentFocus.length > 0 && (
          <li>Current focus: {profile.currentFocus.join(', ')}</li>
        )}
      </ul>

      <div className="person-profile-summary__meta">
        Extracted from {profile.extractedFrom.totalTurns} turns · Updated{' '}
        {profile.updatedAt ? new Date(profile.updatedAt).toLocaleDateString() : 'unknown'}
      </div>
    </div>
  )
}
