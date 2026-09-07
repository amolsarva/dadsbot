import { describe, expect, it } from 'vitest'

import { describeUnknownValue, describeValue, isSensitiveKey } from '@/lib/redact-env'

const REAL_SECRET = 'sk-proj-0123456789abcdefghijklmnopqrstuvwxyz'

describe('isSensitiveKey', () => {
  it('flags the keys that were leaked in production', () => {
    for (const key of [
      'SUPABASE_SERVICE_ROLE_KEY',
      'SUPABASE_ANON_KEY',
      'GOOGLE_API_KEY',
      'OPENAI_API_KEY',
      'SENDGRID_API_KEY',
      'RESEND_API_KEY',
      'VERCEL_DEPLOYMENT_KEY',
      'AWS_LAMBDA_METADATA_TOKEN',
      'AWS_SECRET_ACCESS_KEY',
      'AWS_SESSION_TOKEN',
    ]) {
      expect(isSensitiveKey(key), key).toBe(true)
    }
  })

  it('leaves operational keys inspectable', () => {
    for (const key of ['NODE_ENV', 'VERCEL_ENV', 'AWS_REGION', 'GOOGLE_MODEL', 'SUPABASE_STORAGE_BUCKET']) {
      expect(isSensitiveKey(key), key).toBe(false)
    }
  })
})

describe('describeValue', () => {
  it('never returns the literal value of a sensitive key', () => {
    const described = describeValue('SUPABASE_SERVICE_ROLE_KEY', REAL_SECRET)
    expect(described).not.toContain(REAL_SECRET)
    expect(described).toBe(`set (${REAL_SECRET.length} chars)`)
  })

  it('reports length so a truncated paste is still diagnosable', () => {
    expect(describeValue('OPENAI_API_KEY', 'short')).toBe('set (5 chars)')
  })

  it('passes through operational values', () => {
    expect(describeValue('GOOGLE_MODEL', 'gemini-2.5-flash')).toBe('gemini-2.5-flash')
    expect(describeValue('AWS_REGION', 'us-east-1')).toBe('us-east-1')
  })

  it('distinguishes unset from set-but-empty', () => {
    expect(describeValue('GOOGLE_MODEL', undefined)).toBeNull()
    expect(describeValue('GOOGLE_MODEL', null)).toBeNull()
    expect(describeValue('GOOGLE_MODEL', '')).toBe('')
  })
})

describe('describeUnknownValue', () => {
  it('withholds the value of anything the curated set does not recognise', () => {
    expect(describeUnknownValue(REAL_SECRET)).toBe('set')
    expect(describeUnknownValue('1321021e-9b4d-473d-aa70-98e313d669af')).toBe('set')
  })

  it('distinguishes unset from set-but-empty', () => {
    expect(describeUnknownValue(undefined)).toBeNull()
    expect(describeUnknownValue('')).toBe('')
  })
})
