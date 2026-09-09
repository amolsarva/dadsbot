import { afterEach, describe, expect, it } from 'vitest'
import { isOperatorRequest } from '../lib/operator-auth'

const originalToken = process.env.OPERATOR_TOKEN

afterEach(() => {
  if (originalToken === undefined) delete process.env.OPERATOR_TOKEN
  else process.env.OPERATOR_TOKEN = originalToken
})

function requestWith(headers: Record<string, string> = {}): Request {
  return new Request('https://example.test/api/blob/sessions/x', { headers })
}

describe('isOperatorRequest', () => {
  it('fails closed when no token is configured', () => {
    delete process.env.OPERATOR_TOKEN
    // Critical: an unconfigured deployment must not authorise raw storage
    // writes and deletes just because nobody set a token.
    expect(isOperatorRequest(requestWith())).toBe(false)
    expect(isOperatorRequest(requestWith({ 'x-operator-token': 'anything' }))).toBe(false)
  })

  it('rejects a missing, empty or wrong token', () => {
    process.env.OPERATOR_TOKEN = 'correct-horse'
    expect(isOperatorRequest(requestWith())).toBe(false)
    expect(isOperatorRequest(requestWith({ 'x-operator-token': '' }))).toBe(false)
    expect(isOperatorRequest(requestWith({ 'x-operator-token': 'wrong' }))).toBe(false)
    // A prefix of the real token must not pass.
    expect(isOperatorRequest(requestWith({ 'x-operator-token': 'correct' }))).toBe(false)
  })

  it('accepts the token via header or bearer scheme', () => {
    process.env.OPERATOR_TOKEN = 'correct-horse'
    expect(isOperatorRequest(requestWith({ 'x-operator-token': 'correct-horse' }))).toBe(true)
    expect(isOperatorRequest(requestWith({ authorization: 'Bearer correct-horse' }))).toBe(true)
    expect(isOperatorRequest(requestWith({ authorization: 'bearer correct-horse' }))).toBe(true)
  })

  it('tolerates surrounding whitespace on the presented token', () => {
    process.env.OPERATOR_TOKEN = 'correct-horse'
    expect(isOperatorRequest(requestWith({ 'x-operator-token': '  correct-horse  ' }))).toBe(true)
  })
})
