import { DEFAULT_NOTIFY_EMAIL_GLOBAL_KEY, isPlaceholderEmail } from './default-notify-email.shared'

let warned = false

function warnOnce(reason: string) {
  if (warned || process.env.NODE_ENV === 'production') return
  warned = true
  console.warn(`[default-email] no usable default address (${reason}); the email field will start empty.`)
}

function usable(value: unknown): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed.length || isPlaceholderEmail(trimmed)) return ''
  return trimmed
}

/**
 * The address a new person's summary emails default to.
 *
 * Returns an empty string when no default is configured. It used to throw,
 * and because it is called while rendering the home and settings screens, a
 * single missing environment variable replaced the whole app with "Application
 * error: a client-side exception has occurred". A missing default is not an
 * emergency: the field simply starts empty and no summary is emailed until
 * someone types an address.
 */
export function readDefaultNotifyEmailClient(): string {
  if (typeof window === 'undefined') {
    const fromServer = usable(process.env.DEFAULT_NOTIFY_EMAIL)
    if (!fromServer) warnOnce('server env unset')
    return fromServer
  }

  const fromBootstrap = usable(Reflect.get(window, DEFAULT_NOTIFY_EMAIL_GLOBAL_KEY))
  if (fromBootstrap) return fromBootstrap

  const fromPublicEnv = usable(process.env.NEXT_PUBLIC_DEFAULT_NOTIFY_EMAIL)
  if (!fromPublicEnv) warnOnce('not provided to the browser')
  return fromPublicEnv
}
