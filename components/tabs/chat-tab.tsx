'use client'

import { TopicProgress } from '@/components/topic-progress'

interface ChatTabProps {
  normalizedHandle: string | null
}

/**
 * ChatTab - The conversation view
 *
 * The voice recording widget is now in a FloatingVoiceRecorder component
 * that stays fixed at the top of the screen and doesn't unmount when
 * switching tabs. This tab just shows the interview progress.
 *
 * The services panel lives once in the page footer (app/page.tsx); rendering it
 * here as well put two identical SERVICES panels on the Interview tab.
 */
export function ChatTab({ normalizedHandle }: ChatTabProps) {
  return (
    <div className="chat-tab">
      <div className="panel-card topic-progress-card">
        <TopicProgress userHandle={normalizedHandle} />
      </div>
    </div>
  )
}
