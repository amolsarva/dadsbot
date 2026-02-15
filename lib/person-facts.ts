'use server'

/**
 * Person profile extraction from conversation
 *
 * This module handles extracting biographical facts from interview conversations
 * to create a dense bullet-point summary of "who is this person".
 */

export type PersonProfile = {
  handle: string
  fullName?: string
  birthplace?: string
  currentLocation?: string
  profession?: string
  yearsExperience?: number
  family?: string
  personalityTraits?: string[]
  memorableStories?: string[]
  currentFocus?: string[]
  updatedAt: string
  extractedFrom: {
    totalTurns: number
    topicsDiscussed?: string[]
  }
}

/**
 * Extract person facts from conversation turns using Claude AI
 *
 * Uses the AnthropicSDK (or similar) to analyze conversation text and extract
 * key biographical information about the person being interviewed.
 */
export async function extractPersonFactsFromTurns(
  turns: Array<{ role: 'user' | 'assistant'; text: string }>,
  _handle: string
): Promise<PersonProfile> {
  // For now, return a placeholder/stub that will be filled in when we call Claude API
  // This will be implemented in the API route that has access to the API key

  const totalTurns = turns.length

  return {
    handle: _handle,
    updatedAt: new Date().toISOString(),
    extractedFrom: {
      totalTurns,
      topicsDiscussed: [],
    },
  }
}

/**
 * Merge two PersonProfile objects, with newer data taking precedence
 */
export function mergePersonProfiles(
  existing: PersonProfile | undefined,
  incoming: Partial<PersonProfile>
): PersonProfile {
  const merged: PersonProfile = {
    handle: existing?.handle ?? incoming.handle ?? 'unknown',
    fullName: incoming.fullName ?? existing?.fullName,
    birthplace: incoming.birthplace ?? existing?.birthplace,
    currentLocation: incoming.currentLocation ?? existing?.currentLocation,
    profession: incoming.profession ?? existing?.profession,
    yearsExperience: incoming.yearsExperience ?? existing?.yearsExperience,
    family: incoming.family ?? existing?.family,
    personalityTraits: incoming.personalityTraits ?? existing?.personalityTraits,
    memorableStories: incoming.memorableStories ?? existing?.memorableStories,
    currentFocus: incoming.currentFocus ?? existing?.currentFocus,
    updatedAt: incoming.updatedAt ?? new Date().toISOString(),
    extractedFrom: {
      totalTurns: incoming.extractedFrom?.totalTurns ?? existing?.extractedFrom.totalTurns ?? 0,
      topicsDiscussed: incoming.extractedFrom?.topicsDiscussed ?? existing?.extractedFrom.topicsDiscussed,
    },
  }

  return merged
}

/**
 * Format PersonProfile for display as bullet points
 */
export function formatPersonProfileAsText(profile: PersonProfile): string {
  const lines: string[] = []

  if (profile.birthplace && profile.currentLocation) {
    lines.push(`Born in ${profile.birthplace}, now lives in ${profile.currentLocation}`)
  } else if (profile.currentLocation) {
    lines.push(`Lives in ${profile.currentLocation}`)
  }

  if (profile.profession) {
    if (profile.yearsExperience) {
      lines.push(`${profile.profession}, ${profile.yearsExperience} years experience`)
    } else {
      lines.push(`Works as ${profile.profession}`)
    }
  }

  if (profile.family) {
    lines.push(`Family: ${profile.family}`)
  }

  if (profile.personalityTraits && profile.personalityTraits.length > 0) {
    lines.push(`Personality: ${profile.personalityTraits.join(', ')}`)
  }

  if (profile.memorableStories && profile.memorableStories.length > 0) {
    lines.push(`Memorable: ${profile.memorableStories[0]}`)
  }

  if (profile.currentFocus && profile.currentFocus.length > 0) {
    lines.push(`Current focus: ${profile.currentFocus.join(', ')}`)
  }

  return lines.join('\n')
}
