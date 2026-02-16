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
 * Extract person facts from conversation turns using OpenAI
 *
 * Uses OpenAI API to analyze conversation text and extract
 * key biographical information about the person being interviewed.
 */
export async function extractPersonFactsFromTurns(
  turns: Array<{ role: 'user' | 'assistant'; text: string }>,
  handle: string | null
): Promise<PersonProfile> {
  const normalizedHandle = handle ?? 'unknown'
  try {

    // If no API key, return minimal profile
    if (!process.env.OPENAI_API_KEY) {
      return {
        handle: normalizedHandle,
        updatedAt: new Date().toISOString(),
        extractedFrom: {
          totalTurns: turns.length,
          topicsDiscussed: [],
        },
      }
    }

    // Import OpenAI client
    const OpenAI = require('openai').default
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

    // Build conversation transcript for analysis
    const transcript = turns
      .map((t) => `${t.role === 'user' ? 'Person' : 'Interviewer'}: ${t.text}`)
      .join('\n\n')

    // Call OpenAI to extract biographical facts
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a biographical data extractor. Analyze the conversation transcript below and extract key facts about the person being interviewed.

Return a JSON object with these fields (only include fields where you found clear information):
{
  "fullName": "Full name if mentioned",
  "birthplace": "Where they were born",
  "currentLocation": "Where they currently live",
  "profession": "Their job/career",
  "yearsExperience": "Number of years in their profession (as number, not string)",
  "family": "Description of their family",
  "personalityTraits": ["Array of personality traits mentioned"],
  "memorableStories": ["Key stories they mentioned"],
  "currentFocus": ["What they're currently focused on"]
}

Extract only information that is directly stated or strongly implied in the conversation.
Return ONLY the JSON object, no other text.`,
        },
        {
          role: 'user',
          content: transcript,
        },
      ],
    })

    const content = response.choices[0]?.message?.content || '{}'

    // Parse the JSON response
    let extractedData: Partial<PersonProfile> = {}
    try {
      extractedData = JSON.parse(content)
    } catch (parseErr) {
      console.error('Failed to parse person facts JSON:', parseErr)
      extractedData = {}
    }

    // Build final profile
    const profile: PersonProfile = {
      handle: normalizedHandle,
      fullName: extractedData.fullName,
      birthplace: extractedData.birthplace,
      currentLocation: extractedData.currentLocation,
      profession: extractedData.profession,
      yearsExperience: extractedData.yearsExperience,
      family: extractedData.family,
      personalityTraits: extractedData.personalityTraits,
      memorableStories: extractedData.memorableStories,
      currentFocus: extractedData.currentFocus,
      updatedAt: new Date().toISOString(),
      extractedFrom: {
        totalTurns: turns.length,
        topicsDiscussed: [],
      },
    }

    return profile
  } catch (error) {
    console.error('Error extracting person facts:', error)
    // Fall back to minimal profile on error
    return {
      handle: normalizedHandle,
      updatedAt: new Date().toISOString(),
      extractedFrom: {
        totalTurns: turns.length,
        topicsDiscussed: [],
      },
    }
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
