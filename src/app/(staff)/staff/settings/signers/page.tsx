import { TownSettingsPage } from '@/components/settings/TownSettingsPage'
import { requireStaffContext } from '@/server/requireStaff'

export const dynamic = 'force-dynamic'

export default async function SignersPage() {
  return await TownSettingsPage({
    ctx: await requireStaffContext(),
    section: 'signers',
    title: 'Signers',
    lead: 'Who signs permits, certificates, orders and letters, with their title and signature.',
  })
}
