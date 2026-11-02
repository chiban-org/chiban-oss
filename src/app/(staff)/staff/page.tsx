import { redirect } from 'next/navigation'
import { requireStaffActor } from '@/server/requireStaff'

const TIMEOUT_MS = 10_000

export default async function StaffHome() {
  await requireStaffActor(AbortSignal.timeout(TIMEOUT_MS))
  redirect('/staff/applications')
}
