'use client'

import { useState } from 'react'
import type { FormEvent } from 'react'

export function EnterForm({ label = 'Family word' }: { label?: string }) {
  const [keyword, setKeyword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting) return
    if (!keyword.trim()) {
      setError('Please type the word to continue.')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/access', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ keyword }),
      })
      if (res.status === 429) {
        setError('Too many tries. Please wait a few minutes, then try again.')
        return
      }
      if (!res.ok) {
        setError('That is not right. Please try again.')
        setKeyword('')
        return
      }

      // Only ever return to a path on this site.
      let next = '/'
      if (typeof window !== 'undefined') {
        const requested = new URLSearchParams(window.location.search).get('next')
        if (requested && requested.startsWith('/') && !requested.startsWith('//')) {
          next = requested
        }
        window.location.assign(next)
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="enter-form" onSubmit={onSubmit}>
      <label className="enter-form__label" htmlFor="enter-keyword">
        {label}
      </label>
      <input
        id="enter-keyword"
        className="enter-form__input"
        value={keyword}
        onChange={(event) => {
          setKeyword(event.target.value)
          if (error) setError(null)
        }}
        type="password"
        autoComplete="current-password"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
      />
      {error ? (
        <p className="enter-form__error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="enter-form__submit" disabled={submitting}>
        {submitting ? 'One moment…' : 'Continue'}
      </button>
    </form>
  )
}
