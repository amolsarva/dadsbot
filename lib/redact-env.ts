/**
 * Redaction helpers for the env diagnostics surface.
 *
 * The diagnostics route is unauthenticated, so it must never emit the literal
 * value of anything that could be a credential. Diagnostics only ever need to
 * answer "is it set, and does it look the right shape" — never "what is it".
 */

/**
 * Key names whose values are treated as secret. Matched case-insensitively
 * against the full variable name, so `SUPABASE_SERVICE_ROLE_KEY`,
 * `AWS_LAMBDA_METADATA_TOKEN` and `SENDGRID_API_KEY` all match.
 */
const SENSITIVE_KEY_PATTERN =
  /(KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|AUTH|SIGNATURE|PRIVATE|DSN|COOKIE|SALT|CERT)/i

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key)
}

/**
 * Describe an env value for display without disclosing it.
 *
 * - unset            → null
 * - set but empty    → ''
 * - sensitive name   → 'set (N chars)'
 * - everything else  → the literal value
 *
 * Only curated, known-non-secret keys should ever reach the literal branch;
 * values for keys the diagnostics set does not recognise must not be passed
 * through this function at all (see `describeUnknownValue`).
 */
export function describeValue(key: string, raw: string | undefined | null): string | null {
  if (raw === undefined || raw === null) return null
  const value = String(raw)
  if (!value.length) return ''
  if (isSensitiveKey(key)) return `set (${value.length} chars)`
  return value
}

/**
 * Describe a variable that is not part of the curated diagnostics set.
 *
 * These are whatever the platform happens to inject, so their names cannot be
 * vetted ahead of time and their values are never safe to emit. Report
 * presence only.
 */
export function describeUnknownValue(raw: string | undefined | null): string | null {
  if (raw === undefined || raw === null) return null
  return String(raw).length ? 'set' : ''
}
