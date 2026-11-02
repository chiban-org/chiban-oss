import { redirect } from 'next/navigation'
import { requireStaffActor } from '@/server/requireStaff'

const TIMEOUT_MS = 10_000

export default async function StaffHome() {
  const actor = await requireStaffActor(AbortSignal.timeout(TIMEOUT_MS))
  const inspectorOnly = actor.roles.length > 0 && actor.roles.every((role) => role === 'inspector')
  redirect(inspectorOnly ? '/staff/inspections/day' : '/staff/applications')
}
