import { SettingsHeader } from '@/components/settings/SettingsHeader'
import { NoPermission } from '@/components/staff/NoPermission'
import { hasCapability } from '@/features/authz/capabilities'
import {
  RULE_SORT,
  RULE_TABLE_SCOPE,
  STATE_LAW_PATH,
  sortRuleSummaries,
} from '@/features/config/settingsTableView'
import { type RawSearchParams, readTableParams } from '@/features/dataTable/params'
import { loadPack } from '@/features/packs/loadPack'
import { packInfo } from '@/features/packs/packInfo'
import { ruleSummary } from '@/features/packs/ruleSummary'
import { scopedSort } from '@/features/staffTables/scopedSort'
import { requireStaffContext } from '@/server/requireStaff'
import { PackRules } from './PackRules'

export default async function StateLawPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>
}) {
  const params = readTableParams(await searchParams)
  const ctx = await requireStaffContext()
  if (!(await hasCapability(ctx.db, ctx.actor.userId, 'config.edit', ctx.signal))) {
    return <NoPermission title="State law" action="change settings" />
  }
  const ruleSort = scopedSort(STATE_LAW_PATH, params, RULE_SORT, RULE_TABLE_SCOPE)
  const rules = sortRuleSummaries(loadPack().rules.map(ruleSummary), ruleSort.state)
  const info = packInfo()
  return (
    <main>
      <SettingsHeader
        title="State law"
        lead="The rules Chiban follows from state law, and what the town can change in each."
      />
      <PackRules rules={rules} links={ruleSort.links} />
      <p className="text-sm text-muted-foreground">{`Jurisdiction pack ${info.id} version ${info.version}, fingerprint ${info.hash.slice(0, 12)}.`}</p>
    </main>
  )
}
