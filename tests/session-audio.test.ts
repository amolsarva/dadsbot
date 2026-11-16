import { describe, expect, it, vi } from 'vitest'
import {
  extensionForAudioMime,
  isSafeSessionId,
  isSessionAudioPathFor,
  sessionAudioPath,
} from '../lib/session-audio-path'
import { INLINE_AUDIO_BYTE_LIMIT, saveSessionRecording } from '../lib/save-session-recording'
import { parseMailAddress } from '../lib/email'

describe('session audio paths', () => {
  it('accepts ordinary ids and refuses anything that could escape the folder', () => {
    expect(isSafeSessionId('3f2a9c1e-7b1d-4c58-9a0e-1234567890ab')).toBe(true)
    expect(isSafeSessionId('../other')).toBe(false)
    expect(isSafeSessionId('a/b')).toBe(false)
    expect(isSafeSessionId('')).toBe(false)
    expect(isSafeSessionId(undefined)).toBe(false)
  })

  it('maps recorder mime types to an extension and refuses unknown ones', () => {
    expect(extensionForAudioMime('audio/webm;codecs=opus')).toBe('webm')
    expect(extensionForAudioMime('audio/mp4')).toBe('mp4')
    expect(extensionForAudioMime('text/html')).toBeNull()
    expect(extensionForAudioMime(undefined)).toBeNull()
  })

  it('lets a session claim only its own recording', () => {
    const own = sessionAudioPath('abc', 'mp4')
    expect(isSessionAudioPathFor('abc', own)).toBe(true)
    expect(isSessionAudioPathFor('abc', sessionAudioPath('xyz', 'mp4'))).toBe(false)
    expect(isSessionAudioPathFor('abc', 'memory/primers/dad.md')).toBe(false)
    expect(isSessionAudioPathFor('abc', 'sessions/abc/session-audio.exe')).toBe(false)
    expect(isSessionAudioPathFor('abc', 'sessions/abc/session-audio.mp4/../../x')).toBe(false)
  })
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('saveSessionRecording', () => {
  const base = { sessionId: 'abc', mimeType: 'audio/mp4', durationMs: 1000 }

  it('uploads straight to storage and then records the path, never sending the bytes to the app', async () => {
    const big = new Blob([new Uint8Array(INLINE_AUDIO_BYTE_LIMIT + 10)])
    const fetchImpl = vi.fn(async (url: any, init?: any) => {
      if (url === '/api/session-audio/upload-url') {
        return json({ ok: true, uploadUrl: 'https://storage.example/upload?token=t', path: 'sessions/abc/session-audio.mp4' })
      }
      if (url === 'https://storage.example/upload?token=t') {
        expect(init.method).toBe('PUT')
        expect(init.body).toBe(big)
        return new Response('{}', { status: 200 })
      }
      const body = JSON.parse(init.body)
      expect(body.audio).toBeUndefined()
      expect(body.path).toBe('sessions/abc/session-audio.mp4')
      return json({ ok: true, url: 'https://cdn.example/a.mp4', durationMs: 1000 })
    })
    const result = await saveSessionRecording({ ...base, blob: big, fetchImpl: fetchImpl as any })
    expect(result).toEqual({ ok: true, url: 'https://cdn.example/a.mp4', durationMs: 1000, via: 'direct' })
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('falls back to the inline route for a small recording when direct upload is unavailable', async () => {
    const small = new Blob([new Uint8Array([1, 2, 3])])
    const fetchImpl = vi.fn(async (url: any, init?: any) => {
      if (url === '/api/session-audio/upload-url') return json({ ok: false }, 500)
      expect(JSON.parse(init.body).audio).toBe('AQID')
      return json({ ok: true, url: 'u', durationMs: 1000 })
    })
    const result = await saveSessionRecording({ ...base, blob: small, fetchImpl: fetchImpl as any })
    expect(result).toMatchObject({ ok: true, via: 'inline' })
  })

  it('reports failure rather than attempting an inline upload that cannot fit', async () => {
    const big = new Blob([new Uint8Array(INLINE_AUDIO_BYTE_LIMIT + 10)])
    const fetchImpl = vi.fn(async () => json({ ok: false }, 500))
    const result = await saveSessionRecording({ ...base, blob: big, fetchImpl: fetchImpl as any })
    expect(result.ok).toBe(false)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('refuses an empty recording without calling anything', async () => {
    const fetchImpl = vi.fn()
    const result = await saveSessionRecording({ ...base, blob: new Blob([]), fetchImpl: fetchImpl as any })
    expect(result).toEqual({ ok: false, reason: 'empty_recording' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('parseMailAddress', () => {
  it('splits a display name from the address', () => {
    expect(parseMailAddress("Dad's Bot <bot@example.com>")).toEqual({ name: "Dad's Bot", email: 'bot@example.com' })
    expect(parseMailAddress('"DadsBot" <bot@example.com>')).toEqual({ name: 'DadsBot', email: 'bot@example.com' })
    expect(parseMailAddress(' bot@example.com ')).toEqual({ email: 'bot@example.com' })
  })
})
