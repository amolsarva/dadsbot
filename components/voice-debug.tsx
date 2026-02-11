'use client'

import { useEffect, useRef } from 'react'

export type VoiceDebugEntry = {
  id: string
  time: string
  source: 'openai' | 'browser' | 'error' | 'system'
  message: string
}

type VoiceDebugProps = {
  entries: VoiceDebugEntry[]
  visible?: boolean
}

export function VoiceDebug({ entries, visible = true }: VoiceDebugProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new entries are added
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [entries])

  if (!visible || entries.length === 0) return null

  return (
    <div className="voice-debug" ref={containerRef}>
      {entries.slice(-15).map((entry) => (
        <div key={entry.id} className="voice-debug__entry">
          <span className="voice-debug__time">{entry.time}</span>
          <span className={`voice-debug__source voice-debug__source--${entry.source}`}>
            {entry.source.toUpperCase()}
          </span>
          <span className="voice-debug__message">{entry.message}</span>
        </div>
      ))}
    </div>
  )
}

// Helper to create a debug entry
let entryCounter = 0
export function createVoiceDebugEntry(
  source: VoiceDebugEntry['source'],
  message: string
): VoiceDebugEntry {
  entryCounter += 1
  const now = new Date()
  const time = now.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }) + '.' + String(now.getMilliseconds()).padStart(3, '0')

  return {
    id: `voice-${entryCounter}-${Date.now()}`,
    time,
    source,
    message,
  }
}

export default VoiceDebug
