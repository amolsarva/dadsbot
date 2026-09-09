import { describe, expect, it } from 'vitest'
import { formatFromMimeType } from '../lib/audio-bridge'

describe('formatFromMimeType', () => {
  it('maps Safari/iOS mp4 recordings to the mp4 label', () => {
    // Regression: this used to be hardcoded to 'webm', so iPhone recordings were
    // sent to the transcription provider labelled as the wrong container.
    expect(formatFromMimeType('audio/mp4')).toBe('mp4')
    expect(formatFromMimeType('audio/mp4;codecs=mp4a.40.2')).toBe('mp4')
    expect(formatFromMimeType('audio/x-m4a')).toBe('mp4')
  })

  it('maps Chrome/Firefox containers to their own labels', () => {
    expect(formatFromMimeType('audio/webm;codecs=opus')).toBe('webm')
    expect(formatFromMimeType('audio/ogg;codecs=opus')).toBe('ogg')
    expect(formatFromMimeType('audio/wav')).toBe('wav')
  })

  it('is case insensitive', () => {
    expect(formatFromMimeType('AUDIO/MP4')).toBe('mp4')
  })

  it('falls back to webm when the browser reports nothing usable', () => {
    expect(formatFromMimeType(undefined)).toBe('webm')
    expect(formatFromMimeType(null)).toBe('webm')
    expect(formatFromMimeType('')).toBe('webm')
    expect(formatFromMimeType('application/octet-stream')).toBe('webm')
  })
})
