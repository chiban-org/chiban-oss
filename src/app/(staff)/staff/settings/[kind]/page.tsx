import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ActionForm } from '@/components/ActionForm'
import { QuickFilters } from '@/components/dataTable/QuickFilters'
import { SortHeader } from '@/components/dataTable/SortHeader'
import { SelectField, TextField } from '@/components/staff/fields'
import { NoPermission } from '@/components/staff/NoPermission'
import { KIND_LABELS } from '@/features/config/kindLabels'
import { isConfigKind } from '@/features/config/kinds'
import {
  arrangeKeyRows,
  KEY_FILTER_PARAMS,
  KEY_SORT,
  readKeyListView,
} from '@/features/config/settingsTableView'
import { listKeysOfKind } from '@/features/config/settingsViews'
import { clearHref, type RawSearchParams } from '@/features/dataTable/params'
import { sortLinks } from '@/features/dataTable/sort'
import { loadPack } from '@/features/packs/loadPack'
import { recordStaffContext } from '@/server/requireStaff'
import { startDraftAction } from '../actions'

const SINGLETON_KINDS = [
  'payment_settings',
  'inspection_settings',
  'board_settings',
  'regional_contacts',
  'review_routes',
]

interface Props {
  params: Promise<{ kind: string }>
  searchParams: Promise<RawSearchParams>
}

export default async function SettingsKindPage({ params, searchParams }: Props) {
  const { kind } = await params
  const view = readKeyListView(await searchParams)
  if (!isConfigKind(kind)) notFound()
  const ctx = await recordStaffContext()
  if (ctx === null) return <NoPermission title="Settings" action="change settings" />
  const all = await listKeysOfKind(ctx.db, kind, ctx.signal)
  const path = `/staff/settings/${kind}`
  const { rows, chips } = arrangeKeyRows(path, all, view)
  const links = sortLinks(path, view.params, KEY_SORT, view.sort)
  const clear = clearHref(path, view.params, KEY_FILTER_PARAMS)
  const townRules = loadPack().rules.filter((r) => r.kind === 'town_setting')
  return (
    <main data-wide="">
      <p>
        <Link href="/staff/settings" className="text-action underline">
          Settings
        </Link>
      </p>
      <h1>{KIND_LABELS[kind]}</h1>
      {all.length === 0 ? <p>Nothing is configured here yet.</p> : null}
      {all.length === 0 ? null : (
        <>
          <div className="toolbar my-3">
            <QuickFilters label="Quick filters" groups={chips} clearHref={clear} />
          </div>
          <div className="table-panel my-3">
            {rows.length === 0 ? (
              <p className="px-5 py-8">Nothing here matches these filters.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <SortHeader label="Key" link={links.key} />
                    <SortHeader label="Published" link={links.published} />
                    <SortHeader label="Draft" link={links.draft} />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.key}>
                      <td>
                        <Link
                          href={`/staff/settings/${kind}/${encodeURIComponent(row.key)}`}
                          className="text-action underline"
                        >
                          {row.key}
                        </Link>
                      </td>
                      <td>
                        {row.publishedVersion === null
                          ? 'Not published'
                          : `Published version ${row.publishedVersion}`}
                      </td>
                      <td>{row.hasDraft ? 'Has an unpublished draft' : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
      <h2>Start a new one</h2>
      <ActionForm action={startDraftAction} submitLabel="Start a draft" className="max-w-md">
        <input type="hidden" name="kind" value={kind} />
        {kind === 'town_rule_setting' ? (
          <SelectField
            label="Rule"
            name="key"
            options={townRules.map((r): [string, string] => [r.key, r.label])}
          />
        ) : SINGLETON_KINDS.includes(kind) ? (
          <input type="hidden" name="key" value="default" />
        ) : (
          <TextField
            label="Key"
            name="key"
            required
            hint="Letters, numbers, hyphens, underscores, and dots. Other items refer to it by this key."
          />
        )}
      </ActionForm>
    </main>
  )
}
