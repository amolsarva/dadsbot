'use client'

import { SettingsView } from '@/app/settings/settings-view'

interface SettingsTabProps {
  handle: string | null
}

export function SettingsTab({ handle }: SettingsTabProps) {
  return (
    <div className="settings-tab">
      <SettingsView userHandle={handle ?? undefined} />
    </div>
  )
}
