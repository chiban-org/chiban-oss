import { redirect } from 'next/navigation'
import { NoPermission } from '@/components/staff/NoPermission'
import { settingsMenuFor } from '@/features/settingsMenu/settingsMenu'
import { loadNavViewer } from '@/features/staffNav/viewer'
import { requireStaffContext } from '@/server/requireStaff'

export default async function SettingsPage() {
  const ctx = await requireStaffContext()
  const [first] = settingsMenuFor(await loadNavViewer(ctx.db, ctx.actor, ctx.signal))
  if (first === undefined) return <NoPermission title="Settings" action="change settings" />
  redirect(first.href)
}
