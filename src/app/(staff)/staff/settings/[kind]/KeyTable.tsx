import Link from 'next/link'
import { QuickFilters } from '@/components/dataTable/QuickFilters'
import { SortHeader } from '@/components/dataTable/SortHeader'
import type { ConfigKind } from '@/features/config/kinds'
import {
  arrangeKeyRows,
  KEY_FILTER_PARAMS,
  KEY_SORT,
  type KeyListView,
} from '@/features/config/settingsTableView'
import type { KeyRow } from '@/features/config/settingsViews'
import { clearHref } from '@/features/dataTable/params'
import { sortLinks } from '@/features/dataTable/sort'

export function KeyTable({
  kind,
  all,
  view,
}: {
  kind: ConfigKind
  all: readonly KeyRow[]
  view: KeyListView
}) {
  const named = all.some((row) => row.label !== null)
  const path = `/staff/settings/${kind}`
  const { rows, chips } = arrangeKeyRows(path, all, view)
  const links = sortLinks(path, view.params, KEY_SORT, view.sort)
  const clear = clearHref(path, view.params, KEY_FILTER_PARAMS)
  return (
    <>
      <div className="toolbar my-3">
        <QuickFilters label="Quick filters" groups={chips} clearHref={clear} />
      </div>
      <div className="table-panel my-3">
        {rows.length === 0 ? (
          <p className="px-5 py-8">Nothing here matches these filters.</p>
        ) : (
          <table className="w-full text-sm">
            <caption className="sr-only">By key, A to Z.</caption>
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
  )
}
