'use client'

import { TopicProgress } from '@/components/topic-progress'
import { ServiceStatusGrid } from '@/components/service-status-grid'

interface ChatTabProps {
  normalizedHandle: string | null
  diagnosticsHref: string
}

/**
 * ChatTab - The conversation view
 *
 * The voice recording widget is now in a FloatingVoiceRecorder component
 * that stays fixed at the top of the screen and doesn't unmount when
 * switching tabs. This tab just shows the interview progress and status.
 */
export function ChatTab({ normalizedHandle, diagnosticsHref }: ChatTabProps) {
  return (
    <div className="chat-tab">
      <div className="panel-card topic-progress-card">
        <TopicProgress userHandle={normalizedHandle} />
      </div>

      <div className="panel-card">
        <ServiceStatusGrid diagnosticsHref={diagnosticsHref} />
      </div>
    </div>
  )
}
