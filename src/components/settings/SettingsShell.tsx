import type { ReactNode } from 'react'
import { groupSettingsMenu, settingsMenuFor } from '@/features/settingsMenu/settingsMenu'
import { loadNavViewer } from '@/features/staffNav/viewer'
import { requireStaffContext } from '@/server/requireStaff'
import { SettingsMenu } from './SettingsMenu'

export async function SettingsShell({ children }: { children: ReactNode }) {
  const ctx = await requireStaffContext()
  const viewer = await loadNavViewer(ctx.db, ctx.actor, ctx.signal)
  const sections = groupSettingsMenu(settingsMenuFor(viewer))
  if (sections.length === 0) return <>{children}</>
  return (
    <div className="settings-shell md:flex md:items-start md:gap-10">
      <SettingsMenu sections={sections} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
