'use client'

import type { CSSProperties } from 'react'

import { SetupStatus } from '@/components/setup-status'

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

  // Onboarding / first-run
  accountHandle: string | null
  onNameYourself: () => void

  // Handlers
  onStartAgain: () => void
}

export function FloatingVoiceRecorder({
  sessionId: _sessionId,
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
  accountHandle,
  onNameYourself,
  onStartAgain,
}: FloatingVoiceRecorderProps) {
  const isSessionActive = hasStarted && (machineState !== 'idle' || finishRequested)
  const showWelcome = !hasStarted && !startupError && !fatalError && !finishRequested

  const activeAlert: {
    kind: 'fatal' | 'startup' | 'provider'
    title: string
    message: string
    details: string[]
  } | null = fatalError
    ? { kind: 'fatal', title: '🛑 Session halted', message: fatalError, details: fatalDetails }
    : startupError
      ? { kind: 'startup', title: '🚫 Could not start', message: startupError, details: startupDetails }
      : providerError
        ? {
            kind: 'provider',
            title: `⚠️ Trouble reaching Google${providerError.status ? ` · HTTP ${providerError.status}` : ''}`,
            message: providerError.message,
            details: [],
          }
        : null

  return (
    <div className="floating-voice-recorder">
      <div className="floating-voice-recorder__container">
        {showWelcome ? (
          <div className="recorder-welcome">
            <h2 className="recorder-welcome__title">
              {accountHandle ? `Welcome back, @${accountHandle}` : 'Capture a memory, one question at a time'}
            </h2>
            <p className="recorder-welcome__lede">
              DadsBot is a warm, voice-first biographer. Tap the circle below and it
              will ask a question, then listen as you answer—no typing required.
            </p>
            <ol className="recorder-welcome__steps">
              <li>
                <span className="recorder-welcome__step-num">1</span>
                Tap the circle to begin (we&apos;ll ask for the microphone once).
              </li>
              <li>
                <span className="recorder-welcome__step-num">2</span>
                Listen to the question, then just start talking.
              </li>
              <li>
                <span className="recorder-welcome__step-num">3</span>
                Tap when you&apos;re done, or say you&apos;re finished to save and email a recap.
              </li>
            </ol>
            {!accountHandle ? (
              <div className="recorder-welcome__guest">
                <span>
                  You&apos;re recording as a <strong>guest</strong>. Add a name so your
                  stories are saved and remembered next time.
                </span>
                <button type="button" className="btn-secondary" onClick={onNameYourself}>
                  Add your name
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
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
              {turn > 0 ? (
                <div className="status-turn">
                  Question {turn}
                  {machineState === 'doneSuccess' ? ' · saved' : ''}
                </div>
              ) : null}
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

        {/* A single, highest-severity alert. Stacking all three at once buried
            the actionable one under near-identical banners. */}
        {activeAlert ? (
          <div className="floating-voice-recorder__alerts">
            <div className="alert-banner alert-banner--error" role="alert">
              <div className="alert-banner__title">{activeAlert.title}</div>
              <div className="alert-banner__message">{activeAlert.message}</div>
              {activeAlert.details.length ? (
                <div className="alert-banner__details">
                  {activeAlert.details.map((detail, index) => (
                    <div key={`${activeAlert.kind}-detail-${index}`}>• {detail}</div>
                  ))}
                </div>
              ) : null}
              {activeAlert.kind === 'startup' ? <SetupStatus /> : null}
              <div className="alert-banner__meta">
                {activeAlert.kind === 'provider' && providerError ? (
                  <>
                    Captured {providerError.at || 'time unknown'} · Reason:{' '}
                    {providerError.reason ? providerError.reason.replace(/_/g, ' ') : 'unspecified'} ·{' '}
                  </>
                ) : null}
                <a className="link" href={diagnosticsHref}>
                  Open diagnostics
                </a>
              </div>
              {activeAlert.kind === 'provider' && providerError?.snippet ? (
                <pre className="alert-banner__snippet">{providerError.snippet}</pre>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
