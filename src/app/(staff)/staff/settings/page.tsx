import Link from 'next/link'
import { CodeEditionTable } from '@/components/config/CodeEditionTable'
import { SortHeader } from '@/components/dataTable/SortHeader'
import { NoPermission } from '@/components/staff/NoPermission'
import { hasCapability } from '@/features/authz/capabilities'
import { KIND_LABELS } from '@/features/config/kindLabels'
import {
  KIND_SORT,
  KIND_TABLE_SCOPE,
  RULE_SORT,
  RULE_TABLE_SCOPE,
  SETTINGS_PATH,
  sortKindSummaries,
  sortRuleSummaries,
} from '@/features/config/settingsTableView'
import { listKeysOfKind, summarizeKinds } from '@/features/config/settingsViews'
import { type RawSearchParams, readTableParams } from '@/features/dataTable/params'
import { loadPack } from '@/features/packs/loadPack'
import { packInfo } from '@/features/packs/packInfo'
import { ruleSummary } from '@/features/packs/ruleSummary'
import { scopedSort } from '@/features/staffTables/scopedSort'
import { recordStaffContext } from '@/server/requireStaff'
import { PackRules } from './PackRules'
import { StarterList } from './StarterList'

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>
}) {
  const params = readTableParams(await searchParams)
  const ctx = await recordStaffContext()
  if (ctx === null) return <NoPermission title="Settings" action="change settings" />
  const kindSort = scopedSort(SETTINGS_PATH, params, KIND_SORT, KIND_TABLE_SCOPE)
  const ruleSort = scopedSort(SETTINGS_PATH, params, RULE_SORT, RULE_TABLE_SCOPE)
  const kinds = sortKindSummaries(await summarizeKinds(ctx.db, ctx.signal), kindSort.state)
  const [typeKeys, canEdit] = await Promise.all([
    listKeysOfKind(ctx.db, 'application_type', ctx.signal),
    hasCapability(ctx.db, ctx.actor.userId, 'config.edit', ctx.signal),
  ])
  const adopted = new Set(typeKeys.map((k) => k.key))
  const pack = loadPack()
  const rules = sortRuleSummaries(pack.rules.map(ruleSummary), ruleSort.state)
  const info = packInfo()
  const ruleSorted = params.has(`${RULE_TABLE_SCOPE}_sort`)
  return (
    <main>
      <h1>Settings</h1>
      <p className="text-muted-foreground">
        Everything a permit needs is configuration: forms, fee schedules, templates, conditions,
        checklists, application types, and the few values the statute leaves to the town. Each
        change is a new version. Applications already open keep the versions they started under.
      </p>
      <h2>Configuration</h2>
      <div className="table-panel my-3">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <SortHeader label="Kind" link={kindSort.links.kind} />
              <SortHeader label="Items" link={kindSort.links.items} />
            </tr>
          </thead>
          <tbody>
            {kinds.map((k) => (
              <tr key={k.kind}>
                <td>
                  <Link href={`/staff/settings/${k.kind}`} className="text-action underline">
                    {KIND_LABELS[k.kind]}
                  </Link>
                </td>
                <td>{k.keys}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2>Other settings</h2>
      <ul>
        <li>
          <Link href="/staff/settings/payments" className="text-action underline">
            Card payments: processor accounts and convenience fee
          </Link>
        </li>
        <li>
          <Link href="/staff/settings/inspections" className="text-action underline">
            Inspections: days, hours, and inspector calendars
          </Link>
        </li>
      </ul>
      <h2>Starter templates</h2>
      <p className="text-muted-foreground">
        A starter copies a complete set of forms, fees, conditions, checklists, a permit template,
        and an application type into your configuration. The fee amounts are examples for the
        fictional Town of Alder Pond. Change them to your own schedule before you use them.
      </p>
      <p>
        <Link href="/staff/settings/starters" className="text-action underline">
          Check adopted starters for updates
        </Link>
      </p>
      <StarterList adopted={adopted} canAdopt={canEdit} />
      <h2>Jurisdiction pack</h2>
      <p className="text-muted-foreground">{`Pack ${info.id} version ${info.version}, fingerprint ${info.hash.slice(0, 12)}. The rules below come from state law. The last column says what the town can change.`}</p>
      <PackRules rules={rules} links={ruleSort.links} open={ruleSorted} />
      <h2>State building code editions</h2>
      <CodeEditionTable editions={pack.codeEditions} />
    </main>
  )
}
