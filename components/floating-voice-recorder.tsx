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
    ? { kind: 'fatal', title: 'We had to stop', message: fatalError, details: fatalDetails }
    : startupError
      ? { kind: 'startup', title: 'We can’t start just yet', message: startupError, details: startupDetails }
      : providerError
        ? {
            // The storyteller does not need to know which vendor failed.
            kind: 'provider',
            title: 'I’m having trouble hearing you',
            message: 'Something went wrong on our side. Please try again in a moment.',
            details: [],
          }
        : null

  return (
    <div className="floating-voice-recorder">
      <div className="floating-voice-recorder__container">
        {showWelcome ? (
          <div className="recorder-welcome">
            <h2 className="recorder-welcome__title">
              {accountHandle ? `Welcome back, ${accountHandle}` : 'Tell me a story from your life'}
            </h2>
            <p className="recorder-welcome__lede">
              I&apos;ll ask you a question out loud. You just answer in your own
              words — there is nothing to type, and no wrong answer.
            </p>
            <ol className="recorder-welcome__steps">
              <li>
                <span className="recorder-welcome__step-num">1</span>
                Press the big orange circle below to start.
              </li>
              <li>
                <span className="recorder-welcome__step-num">2</span>
                Your phone will ask to use the microphone. Choose Allow.
              </li>
              <li>
                <span className="recorder-welcome__step-num">3</span>
                Listen to my question, then talk for as long as you like.
              </li>
              <li>
                <span className="recorder-welcome__step-num">4</span>
                When you are finished, press &ldquo;I&apos;m finished&rdquo;. Everything is saved for you.
              </li>
            </ol>
            {!accountHandle ? (
              <div className="recorder-welcome__guest">
                <span>
                  Tell me your name and I&apos;ll remember your stories next time.
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
                  Start again
                </button>
              ) : null}
              {machineState !== 'doneSuccess' && (
                <button
                  onClick={requestFinish}
                  disabled={heroDisabled || !hasStarted || finishRequested}
                  className="btn-secondary btn-large"
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
              <button type="button" className="btn-primary alert-banner__retry" onClick={onStartAgain}>
                Try again
              </button>
              {/* Everything below is for whoever set the app up, not the person
                  telling the story — so it stays folded away by default. */}
              <details className="alert-banner__technical">
                <summary>Technical details</summary>
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
              </details>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
