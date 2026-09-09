import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

type SetupCheck = {
  key: string
  label: string
  ready: boolean
  required: boolean
  missing: string[]
  hint: string
}

function isPresent(name: string): boolean {
  const value = process.env[name]
  return typeof value === 'string' && value.trim().length > 0
}

function requireAll(
  key: string,
  label: string,
  vars: string[],
  hint: string,
  required = true,
): SetupCheck {
  const missing = vars.filter((name) => !isPresent(name))
  return { key, label, ready: missing.length === 0, required, missing, hint }
}

/**
 * Reports which configuration groups are present, without touching the network
 * or throwing. This is what the UI uses to explain a failed start in plain
 * language instead of a generic "diagnostics required" message. It deliberately
 * reports only presence — never values.
 */
export async function GET() {
  const checks: SetupCheck[] = [
    requireAll(
      'storage',
      'Storage & database',
      [
        'SUPABASE_URL',
        'SUPABASE_SERVICE_ROLE_KEY',
        'SUPABASE_STORAGE_BUCKET',
        'SUPABASE_SESSIONS_TABLE',
        'SUPABASE_TURNS_TABLE',
      ],
      'Without Supabase, sessions, turns and audio cannot be saved.',
    ),
    requireAll(
      'model',
      'Conversation model',
      ['GOOGLE_API_KEY'],
      'Google Gemini transcribes each answer and writes the next question.',
    ),
    requireAll(
      'voice',
      'Voice (text-to-speech)',
      ['OPENAI_API_KEY'],
      'OpenAI text-to-speech is how the interviewer speaks out loud.',
    ),
  ]

  // Email is optional and accepts either provider, so it needs its own shape.
  const hasEmailProvider = isPresent('RESEND_API_KEY') || isPresent('SENDGRID_API_KEY')
  const emailMissing: string[] = []
  if (!hasEmailProvider) emailMissing.push('RESEND_API_KEY or SENDGRID_API_KEY')
  if (!isPresent('MAIL_FROM')) emailMissing.push('MAIL_FROM')
  if (!isPresent('DEFAULT_NOTIFY_EMAIL')) emailMissing.push('DEFAULT_NOTIFY_EMAIL')
  checks.push({
    key: 'email',
    label: 'Recap email (optional)',
    ready: emailMissing.length === 0,
    required: false,
    missing: emailMissing,
    hint: 'Only needed to email a transcript after each session.',
  })

  const ready = checks.every((check) => !check.required || check.ready)

  return NextResponse.json({ ok: true, ready, checks })
}
