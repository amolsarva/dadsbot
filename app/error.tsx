'use client'

import { useEffect } from 'react'

/**
 * Last line of defence for anything that throws while a screen renders.
 * The person using this app should never be shown a stack trace or the
 * framework's "Application error" page; they get one plain sentence and one
 * thing to do. The detail goes to the console for whoever looks after the app.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[app-error]', error)
  }, [error])

  return (
    <main className="enter-main">
      <div className="panel-card enter-card" role="alert">
        <h1 className="enter-title">Something went wrong</h1>
        <p className="enter-lede">
          Your stories are safe. This screen just had trouble opening. Please try again.
        </p>
        <button type="button" className="enter-form__submit" onClick={() => reset()}>
          Try again
        </button>
        <p className="enter-help">
          If this keeps happening, tell whoever set up DadsBot for you
          {error?.digest ? ` and give them this code: ${error.digest}` : ''}.
        </p>
      </div>
    </main>
  )
}
