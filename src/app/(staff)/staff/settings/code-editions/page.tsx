import { CodeEditionTable } from '@/components/config/CodeEditionTable'
import { SettingsHeader } from '@/components/settings/SettingsHeader'
import { NoPermission } from '@/components/staff/NoPermission'
import { hasCapability } from '@/features/authz/capabilities'
import { loadPack } from '@/features/packs/loadPack'
import { requireStaffContext } from '@/server/requireStaff'

export default async function CodeEditionsPage() {
  const ctx = await requireStaffContext()
  if (!(await hasCapability(ctx.db, ctx.actor.userId, 'config.edit', ctx.signal))) {
    return <NoPermission title="Building code editions" action="change settings" />
  }
  return (
    <main>
      <SettingsHeader
        title="Building code editions"
        lead="Which edition of the state building code applies to a permit, by the date the application was received."
      />
      <div className="table-panel my-3">
        <CodeEditionTable editions={loadPack().codeEditions} />
      </div>
    </main>
  )
}
