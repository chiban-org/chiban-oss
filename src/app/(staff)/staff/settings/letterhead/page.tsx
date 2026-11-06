import type { Metadata } from 'next'
import { TownSettingsPage } from '@/components/settings/TownSettingsPage'
import { requireStaffContext } from '@/server/requireStaff'

export const metadata: Metadata = { title: 'Letterhead' }

export const dynamic = 'force-dynamic'

export default async function LetterheadPage() {
  return await TownSettingsPage({
    ctx: await requireStaffContext(),
    section: 'letterhead',
    title: 'Letterhead',
    lead: 'How the top and bottom of every page look, and what each board puts on its own documents.',
  })
}
