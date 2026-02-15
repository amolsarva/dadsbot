'use client'

import type { CSSProperties } from 'react'
import { SessionRecorder } from '@/lib/session-recorder'
import { TopicProgress } from '@/components/topic-progress'
import { ServiceStatusGrid } from '@/components/service-status-grid'

type MachineState = 'idle' | 'calibrating' | 'recording' | 'thinking' | 'speakingPrep' | 'playing' | 'readyToContinue' | 'doneSuccess'

type DiagnosticProviderErrorPayload = {
  status: number | null
  message: string
  reason?: string
  snippet?: string
  at: string
  resolved?: boolean
  resolvedAt?: string
}

interface ChatTabProps {
  // Account management
  normalizedHandle: string | null

  // Session state
  sessionId: string | null
  machineState: MachineState
  turn: number
  hasStarted: boolean
  finishRequested: boolean
  audioLevel: number

  // Error states
  providerError: DiagnosticProviderErrorPayload | null
  startupError: string | null
  startupDetails: string[]
  fatalError: string | null
  fatalDetails: string[]

  // Refs
  recorderRef: React.MutableRefObject<SessionRecorder | null>

  // Callbacks
  handleHeroPress: () => void
  requestFinish: () => void
  requestManualStop: () => void

  // Derived values for UI
  heroButtonClasses: string[]
  heroStyles: CSSProperties
  heroAriaLabel: string
  heroIcon: React.ReactNode
  heroBadge: string
  heroTitle: string
  heroDescription: string
  heroDisabled: boolean
  statusMessage: string
  showSkipButton: boolean
  statusHint: string | null
  diagnosticsHref: string

  // Handlers
  onStartAgain: () => void
}

export function ChatTab({
  normalizedHandle,
  sessionId,
  machineState,
  turn,
  hasStarted,
  finishRequested,
  audioLevel,
  providerError,
  startupError,
  startupDetails,
  fatalError,
  fatalDetails,
  recorderRef,
  handleHeroPress,
  requestFinish,
  requestManualStop,
  heroButtonClasses,
  heroStyles,
  heroAriaLabel,
  heroIcon,
  heroBadge,
  heroTitle,
  heroDescription,
  heroDisabled,
  statusMessage,
  showSkipButton,
  statusHint,
  diagnosticsHref,
  onStartAgain,
}: ChatTabProps) {
  return (
    <div className="chat-tab">
      <div className="panel-card hero-card">
        {providerError && (
          <div className="alert-banner alert-banner--error" role="alert">
            <div className="alert-banner__title">
              ⚠️ Trouble reaching Google
              {providerError.status ? ` · HTTP ${providerError.status}` : ''}
            </div>
            <div className="alert-banner__message">{providerError.message}</div>
            <div className="alert-banner__meta">
              Captured {providerError.at || 'time unknown'} · Reason:{' '}
              {providerError.reason ? providerError.reason.replace(/_/g, ' ') : 'unspecified'} ·{' '}
              <a className="link" href={diagnosticsHref}>
                Review diagnostics
              </a>
            </div>
            {providerError.snippet && (
              <pre className="alert-banner__snippet">{providerError.snippet}</pre>
            )}
          </div>
        )}
        {startupError && (
          <div className="alert-banner alert-banner--error" role="alert">
            <div className="alert-banner__title">🚫 Startup blocked</div>
            <div className="alert-banner__message">{startupError}</div>
            {startupDetails.length ? (
              <div className="alert-banner__details">
                {startupDetails.map((detail, index) => (
                  <div key={`startup-detail-${index}`}>• {detail}</div>
                ))}
              </div>
            ) : null}
            <div className="alert-banner__meta">
              <a className="link" href={diagnosticsHref}>
                Open diagnostics
              </a>
            </div>
          </div>
        )}
        {fatalError && (
          <div className="alert-banner alert-banner--error" role="alert">
            <div className="alert-banner__title">🛑 Session halted</div>
            <div className="alert-banner__message">{fatalError}</div>
            {fatalDetails.length ? (
              <div className="alert-banner__details">
                {fatalDetails.map((detail, index) => (
                  <div key={`fatal-detail-${index}`}>• {detail}</div>
                ))}
              </div>
            ) : null}
            <div className="alert-banner__meta">
              <a className="link" href={diagnosticsHref}>
                Review diagnostics
              </a>
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={handleHeroPress}
          className={heroButtonClasses.join(' ')}
          aria-label={heroAriaLabel}
          style={{
            ...heroStyles,
            '--audio-level': machineState === 'recording' ? Math.min(audioLevel / 5, 1) : 0,
          } as CSSProperties}
          disabled={heroDisabled}
        >
          <span className="hero-button__gradient" aria-hidden="true" />
          <span className="hero-button__pulse" aria-hidden="true" />
          <span className="hero-button__dot" aria-hidden="true" />
          {machineState === 'recording' && (
            <span
              className="hero-button__level"
              aria-hidden="true"
              style={{
                transform: `scale(${1 + audioLevel * 0.08})`,
                opacity: Math.min(0.2 + audioLevel * 0.08, 0.7),
              }}
            />
          )}
          <span className="hero-button__content">
            <span className="hero-button__icon" aria-hidden="true">
              {heroIcon}
            </span>
            <span className="hero-button__badge">{heroBadge}</span>
            <span className="hero-button__title">{heroTitle}</span>
            <span className="hero-button__description">{heroDescription}</span>
          </span>
        </button>

        <div className="status-block">
          <div className="status-text">{statusMessage}</div>
          {showSkipButton ? (
            <div className="status-actions">
              <button
                type="button"
                onClick={requestManualStop}
                className="btn-secondary btn-large status-skip"
              >
                ⏭ Next question
              </button>
            </div>
          ) : null}
          {statusHint ? <div className="status-hint">{statusHint}</div> : null}
          {machineState === 'doneSuccess' ? (
            <button
              onClick={onStartAgain}
              className="btn-secondary btn-large"
            >
              Start Again
            </button>
          ) : null}
          {machineState !== 'doneSuccess' && (
            <button
              onClick={requestFinish}
              disabled={heroDisabled || !hasStarted || finishRequested}
              className="btn-outline"
            >
              I'm finished
            </button>
          )}
        </div>
      </div>

      <div className="panel-card topic-progress-card">
        <TopicProgress userHandle={normalizedHandle} />
      </div>

      <div className="panel-card">
        <ServiceStatusGrid diagnosticsHref={diagnosticsHref} />
      </div>
    </div>
  )
}
