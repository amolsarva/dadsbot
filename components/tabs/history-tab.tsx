'use client'

import { HistoryView } from '@/app/history/history-view'

interface HistoryTabProps {
  handle: string | null
}

export function HistoryTab({ handle }: HistoryTabProps) {
  return (
    <div className="history-tab">
      <HistoryView handle={handle} />
    </div>
  )
}
