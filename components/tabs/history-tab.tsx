'use client'

import { HistoryView } from '@/app/history/history-view'
import { PersonProfileSummary } from '@/components/person-profile-summary'

interface HistoryTabProps {
  handle: string | null
  currentSessionId?: string | null
}

export function HistoryTab({ handle, currentSessionId }: HistoryTabProps) {
  return (
    <div className="history-tab">
      {currentSessionId && handle && (
        <div className="history-tab__profile-section">
          <PersonProfileSummary handle={handle} sessionId={currentSessionId} />
        </div>
      )}
      <HistoryView handle={handle} />
    </div>
  )
}
