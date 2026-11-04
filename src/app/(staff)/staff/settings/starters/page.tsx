import Link from 'next/link'
import { SettingsHeader } from '@/components/settings/SettingsHeader'
import { NoPermission } from '@/components/staff/NoPermission'
import { hasCapability } from '@/features/authz/capabilities'
import { listKeysOfKind } from '@/features/config/settingsViews'
import { requireStaffContext } from '@/server/requireStaff'
import { StarterList } from './StarterList'

export const dynamic = 'force-dynamic'

export default async function StartersPage() {
  const ctx = await requireStaffContext()
  if (!(await hasCapability(ctx.db, ctx.actor.userId, 'config.edit', ctx.signal))) {
    return <NoPermission title="Starter templates" action="change settings" />
  }
  const typeKeys = await listKeysOfKind(ctx.db, 'application_type', ctx.signal)
  return (
    <main>
      <SettingsHeader
        title="Starter templates"
        lead="A starter copies a complete permit into your settings: its form, fees, conditions, checklists, permit template and application type."
      />
      <p className="text-muted-foreground">
        The fee amounts are examples for the fictional Town of Alder Pond. Change them to your own
        schedule before you use them.
      </p>
      <StarterList adopted={new Set(typeKeys.map((k) => k.key))} />
      <p>
        <Link href="/staff/settings/starters/updates" className="text-action underline">
          Check adopted starters for updates
        </Link>
      </p>
    </main>
  )
}
