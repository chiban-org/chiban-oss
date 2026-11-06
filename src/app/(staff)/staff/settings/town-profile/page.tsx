import type { Metadata } from 'next'
import { TownSettingsPage } from '@/components/settings/TownSettingsPage'
import { requireStaffContext } from '@/server/requireStaff'

export const metadata: Metadata = { title: 'Town profile' }

export const dynamic = 'force-dynamic'

export default async function TownProfilePage() {
  return await TownSettingsPage({
    ctx: await requireStaffContext(),
    section: 'profile',
    title: 'Town profile',
    lead: 'The office name, address, contact details and logo printed on every document Chiban makes.',
  })
}
