"use client"

import Link from 'next/link'
import { useMemo } from 'react'
import { usePathname } from 'next/navigation'
import { buildScopedPath, normalizeHandle } from '@/lib/user-scope'

function deriveHandleFromPath(pathname: string | null): string | undefined {
  if (!pathname) return undefined
  const segments = pathname.split('/').filter(Boolean)
  if (segments.length >= 2 && segments[0] === 'u') {
    return normalizeHandle(segments[1] ?? undefined)
  }
  return undefined
}

export function SiteNav() {
  const pathname = usePathname()
  const handle = useMemo(() => deriveHandleFromPath(pathname), [pathname])

  const links = useMemo(
    () => [
      { href: buildScopedPath('/', handle), label: 'Talk' },
      { href: buildScopedPath('/history', handle), label: 'My stories' },
      { href: buildScopedPath('/settings', handle), label: 'Settings' },
    ],
    [handle],
  )

  // Scoped routes and the home screen have their own tabs, and the front door
  // has nowhere to go yet. Everywhere else (the standalone history, settings
  // and session pages) this is the only way back, so it must be there.
  if (handle || pathname === '/' || pathname === '/enter') {
    return null
  }

  return (
    <nav className="site-nav" aria-label="Main">
      {links.map((link) => (
        <Link key={link.label} href={link.href} aria-current={pathname === link.href ? 'page' : undefined}>
          {link.label}
        </Link>
      ))}
    </nav>
  )
}
