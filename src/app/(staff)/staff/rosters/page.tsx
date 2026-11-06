import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { NOTICE_CONTACTS_PATH } from '@/features/rosters/links'
import { requireStaffContext } from '@/server/requireStaff'

export const metadata: Metadata = { title: 'Rosters' }

export default async function RostersPage(): Promise<never> {
  await requireStaffContext()
  redirect(NOTICE_CONTACTS_PATH)
}
