import Link from 'next/link'
import { notFound } from 'next/navigation'
import { QuickFilters } from '@/components/dataTable/QuickFilters'
import { SortHeader } from '@/components/dataTable/SortHeader'
import { NoPermission } from '@/components/staff/NoPermission'
import { hasCapability } from '@/features/authz/capabilities'
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
import { recordStaffContext } from '@/server/requireStaff'
import { StartDraft } from './StartDraft'

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
  const [all, canEdit] = await Promise.all([
    listKeysOfKind(ctx.db, kind, ctx.signal),
    hasCapability(ctx.db, ctx.actor.userId, 'config.edit', ctx.signal),
  ])
  const named = all.some((row) => row.label !== null)
  const path = `/staff/settings/${kind}`
  const { rows, chips } = arrangeKeyRows(path, all, view)
  const links = sortLinks(path, view.params, KEY_SORT, view.sort)
  const clear = clearHref(path, view.params, KEY_FILTER_PARAMS)
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
          <p className="text-muted-foreground">By key, A to Z.</p>
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
                    {named ? <SortHeader label="Name" link={links.label} /> : null}
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
                      {named ? <td>{row.label}</td> : null}
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
      {canEdit ? <StartDraft kind={kind} /> : null}
    </main>
  )
}
