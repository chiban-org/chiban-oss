import { NH_STARTERS } from '@packs/nh/starters'
import Link from 'next/link'
import { adoptStarterAction } from '@/app/(staff)/staff/settings/actions'
import { ActionForm } from '@/components/ActionForm'
import { CodeEditionTable } from '@/components/config/CodeEditionTable'
import { SortHeader } from '@/components/dataTable/SortHeader'
import { NoPermission } from '@/components/staff/NoPermission'
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
import { classificationSummary, ruleSummary } from '@/features/packs/ruleSummary'
import { scopedSort } from '@/features/staffTables/scopedSort'
import { recordStaffContext } from '@/server/requireStaff'

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
  const adopted = new Set(
    (await listKeysOfKind(ctx.db, 'application_type', ctx.signal)).map((k) => k.key),
  )
  const pack = loadPack()
  const rules = sortRuleSummaries(pack.rules.map(ruleSummary), ruleSort.state)
  const info = packInfo()
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
      <h2>Card payments</h2>
      <p>
        <Link href="/staff/settings/payments" className="text-action underline">
          Processor accounts and convenience fee
        </Link>
      </p>
      <h2>Inspections</h2>
      <p>
        <Link href="/staff/settings/inspections" className="text-action underline">
          Inspection days, hours, and inspector calendars
        </Link>
      </p>
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
      {NH_STARTERS.map((starter) => (
        <div
          key={starter.id}
          className="my-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-surface p-3"
        >
          <div>
            <strong>{starter.applicationType.label}</strong>
            <p className="m-0 text-sm text-muted-foreground">{`Version ${starter.version}`}</p>
          </div>
          {adopted.has(starter.applicationType.key) ? (
            <span>Adopted</span>
          ) : (
            <ActionForm action={adoptStarterAction} submitLabel="Adopt this starter">
              <input type="hidden" name="starterId" value={starter.id} />
            </ActionForm>
          )}
        </div>
      ))}
      <h2>Jurisdiction pack</h2>
      <p className="text-muted-foreground">{`Pack ${info.id} version ${info.version}, fingerprint ${info.hash.slice(0, 12)}. The rules below come from state law. The town can change only what the policy column allows.`}</p>
      <div className="table-panel my-3">
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr>
              <SortHeader label="Rule" link={ruleSort.links.rule} />
              <SortHeader label="Citation" link={ruleSort.links.citation} />
              <SortHeader label="What the town can change" link={ruleSort.links.policy} />
            </tr>
          </thead>
          <tbody>
            {rules.map((summary) => (
              <tr key={`${summary.key}-${summary.version}`} className="align-top">
                <td>
                  {summary.label}
                  <span className="block text-muted-foreground">{`Version ${summary.version}`}</span>
                </td>
                <td>
                  {summary.citation.url === null ? (
                    summary.citation.label
                  ) : (
                    <a href={summary.citation.url} className="text-action underline">
                      {summary.citation.label}
                    </a>
                  )}
                </td>
                <td>{summary.policy}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>Required rules by classification</h3>
      <ul>
        {pack.classifications.map((c) => {
          const summary = classificationSummary(c, pack)
          return <li key={summary.key}>{`${summary.label}: ${summary.mandatory.join('; ')}`}</li>
        })}
      </ul>
      <h2>State building code editions</h2>
      <CodeEditionTable editions={pack.codeEditions} />
    </main>
  )
}
