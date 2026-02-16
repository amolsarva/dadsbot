'use client'

import { useEffect, useState } from 'react'
import { HistoryView } from '@/app/history/history-view'
import { PersonProfileSummary } from '@/components/person-profile-summary'

interface HistoryTabProps {
  handle: string | null
  currentSessionId?: string | null
}

export function HistoryTab({ handle, currentSessionId }: HistoryTabProps) {
  // Force a remount of HistoryView when handle changes to ensure fresh data load
  const [historyKey, setHistoryKey] = useState(0)

  useEffect(() => {
    setHistoryKey(prev => prev + 1)
  }, [handle])

  return (
    <div className="history-tab">
      {currentSessionId && handle && (
        <div className="history-tab__profile-section">
          <PersonProfileSummary handle={handle} sessionId={currentSessionId} />
        </div>
      )}
      {/* Use key to force remount and data refresh when handle changes */}
      <HistoryView key={`history-${historyKey}-${handle}`} handle={handle} />
    </div>
  )
}
