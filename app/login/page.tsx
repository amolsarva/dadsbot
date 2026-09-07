'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const nextPath = (() => {
    const raw = searchParams.get('next')
    if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/'
    return raw
  })()

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!code.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      if (res.status === 429) {
        setError('Too many attempts. Please wait a few minutes and try again.')
        return
      }
      if (!res.ok) {
        setError('That code was not recognized. Please check it and try again.')
        return
      }
      router.replace(nextPath)
      router.refresh()
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg, #0a1428)',
        padding: '24px',
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          width: '100%',
          maxWidth: '360px',
          background: 'var(--bg-accent, #141c28)',
          borderRadius: '12px',
          padding: '32px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: '22px', color: '#f5f0e6' }}>DadsBot</h1>
          <p style={{ margin: '8px 0 0', fontSize: '15px', color: '#b9c2cf' }}>
            Enter your invite code to continue.
          </p>
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ fontSize: '13px', color: '#b9c2cf' }}>Invite code</span>
          <input
            type="password"
            autoFocus
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            style={{
              padding: '12px 14px',
              borderRadius: '8px',
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'rgba(255,255,255,0.05)',
              color: '#f5f0e6',
              fontSize: '16px',
            }}
          />
        </label>

        {error ? (
          <p role="alert" style={{ margin: 0, fontSize: '14px', color: '#f87171' }}>
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={submitting || !code.trim()}
          style={{
            padding: '12px 16px',
            borderRadius: '8px',
            border: 'none',
            background: 'var(--accent, #d97706)',
            color: '#1a1206',
            fontWeight: 600,
            fontSize: '16px',
            cursor: submitting ? 'default' : 'pointer',
            opacity: submitting || !code.trim() ? 0.7 : 1,
          }}
        >
          {submitting ? 'Checking…' : 'Continue'}
        </button>
      </form>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
