/**
 * Topic Progress Calculation
 *
 * Calculates relative progress on interview guide topics using checkmarks.
 * Each topic gets 0-5 checkmarks based on percentage of conversation dedicated to it.
 */

export type TopicProgress = {
  topic: string
  turnCount: number
  percentage: number
  checkmarks: number // 0-5
}

/**
 * Calculate relative topic progress from turn counts
 *
 * Algorithm:
 * - Count = number of turns dedicated to this topic
 * - Percentage = (count / total_turns) * 100
 * - Checkmarks = Math.round(percentage / 20)  // 5 checkmarks = 5 * 20% = 100%
 *
 * Key: Relative to total conversation length. Early sessions have fewer checkmarks
 * even if they talked a lot about something, since it's relative to total turns.
 *
 * Examples:
 * - 20 total turns, 5 about "childhood" = 25% → 1 checkmark
 * - 20 total turns, 10 about "childhood" = 50% → 3 checkmarks
 * - 100 total turns, 5 about "childhood" = 5% → 0 checkmarks
 * - 100 total turns, 50 about "childhood" = 50% → 3 checkmarks
 */
export function calculateTopicProgress(
  turns: Array<{ role: string; text: string }> | number,
  topicCounts: Record<string, number>
): TopicProgress[] {
  // Handle both array of turns and direct turn count
  const totalTurns = Array.isArray(turns) ? turns.length : (turns as number)

  if (totalTurns === 0) {
    return Object.entries(topicCounts).map(([topic, count]) => ({
      topic,
      turnCount: count,
      percentage: 0,
      checkmarks: 0,
    }))
  }

  return Object.entries(topicCounts).map(([topic, count]) => {
    const percentage = (count / totalTurns) * 100
    const checkmarks = Math.round(percentage / 20)

    return {
      topic,
      turnCount: count,
      percentage: Math.round(percentage * 10) / 10, // Round to 1 decimal place
      checkmarks: Math.min(checkmarks, 5), // Cap at 5 checkmarks
    }
  })
}

/**
 * Get visual representation of progress checkmarks
 *
 * Returns a string of filled (☑) and empty (☐) checkmarks
 */
export function formatCheckmarks(checkmarks: number): string {
  const filled = Math.min(checkmarks, 5)
  const empty = 5 - filled

  return ['☑'.repeat(filled), '☐'.repeat(empty)].join('')
}

/**
 * Get coverage status label for a topic
 *
 * Returns: 'not discussed', 'touched', 'covered', or 'deeply covered'
 */
export function getCoverageLabel(checkmarks: number): string {
  if (checkmarks === 0) return 'not discussed'
  if (checkmarks === 1) return 'touched'
  if (checkmarks <= 3) return 'covered'
  return 'deeply covered'
}
