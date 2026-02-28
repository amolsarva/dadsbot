'use client'

import type { CSSProperties } from 'react'

interface FloatingVoiceRecorderProps {
  // Session state
  sessionId: string | null
  machineState: string
  turn: number
  hasStarted: boolean
  finishRequested: boolean
  audioLevel: number

  // Error states
  providerError: {
    status: number | null
    message: string
    reason?: string
    snippet?: string
    at: string
    resolved?: boolean
    resolvedAt?: string
  } | null
  startupError: string | null
  startupDetails: string[]
  fatalError: string | null
  fatalDetails: string[]

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

export function FloatingVoiceRecorder({
  sessionId: _sessionId,
  machineState,
  turn: _turn,
  hasStarted,
  finishRequested,
  audioLevel,
  providerError,
  startupError,
  startupDetails,
  fatalError,
  fatalDetails,
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
}: FloatingVoiceRecorderProps) {
  const isSessionActive = hasStarted && (machineState !== 'idle' || finishRequested)

  return (
    <div className="floating-voice-recorder">
      <div className="floating-voice-recorder__container">
        <div className="floating-voice-recorder__content">
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

          {isSessionActive && (
            <div className="status-block">
              <div className="status-text">{statusMessage}</div>
              {showSkipButton ? (
                <div className="status-actions">
                  <button
                    type="button"
                    onClick={requestManualStop}
                    className="btn-secondary btn-large status-skip"
                  >
                    Next question
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
                  I&apos;m finished
                </button>
              )}
            </div>
          )}
        </div>

        {/* Error Alerts (in floating context) */}
        <div className="floating-voice-recorder__alerts">
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
        </div>
      </div>
    </div>
  )
}
