'use client'

import { useEffect, useState } from 'react'
import { HistoryView } from '@/app/history/history-view'
import { PersonProfileSummary } from '@/components/person-profile-summary'

interface HistoryTabProps {
  handle: string | null
  currentSessionId?: string | null
}

export function HistoryTab({ handle }: HistoryTabProps) {
  // Force a remount of HistoryView when handle changes to ensure fresh data load
  const [historyKey, setHistoryKey] = useState(0)
  // Track the most recent session ID to show its profile
  const [mostRecentSessionId, setMostRecentSessionId] = useState<string | null>(null)

  useEffect(() => {
    setHistoryKey(prev => prev + 1)
  }, [handle])

  const handleSessionsLoaded = (sessionId: string | null) => {
    setMostRecentSessionId(sessionId)
  }

  return (
    <div className="history-tab">
      {mostRecentSessionId && handle && (
        <div className="history-tab__profile-section">
          <PersonProfileSummary handle={handle} sessionId={mostRecentSessionId} />
        </div>
      )}
      {/* Use key to force remount and data refresh when handle changes */}
      <HistoryView
        key={`history-${historyKey}-${handle}`}
        handle={handle}
        onSessionsLoaded={handleSessionsLoaded}
      />
    </div>
  )
}
