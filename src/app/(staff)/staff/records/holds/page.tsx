import Link from 'next/link'
import { ActionForm } from '@/components/ActionForm'
import { FilterTabs } from '@/components/dataTable/FilterTabs'
import { SortHeader } from '@/components/dataTable/SortHeader'
import { SelectField, TextField } from '@/components/staff/fields'
import { NoPermission } from '@/components/staff/NoPermission'
import type { RawSearchParams } from '@/features/dataTable/params'
import { filterTabs } from '@/features/dataTable/quickFilters'
import { sortLinks } from '@/features/dataTable/sort'
import {
  HOLD_SORT,
  HOLDS_PATH,
  type HoldListRow,
  type HoldState,
  listHoldTable,
  readHoldView,
} from '@/features/records/holdList'
import { getTownSettings } from '@/features/town/settings'
import { formatInstant } from '@/lib/formatDate'
import { requireStaffContext } from '@/server/requireStaff'
import { placeHoldAction, releaseHoldAction } from '../actions'

export const dynamic = 'force-dynamic'

const TARGETS: [string, string][] = [
  ['project', 'Project'],
  ['application', 'Application'],
  ['document', 'Document'],
]
const KIND_LABELS: Record<HoldListRow['targetKind'], string> = {
  project: 'Project',
  application: 'Application',
  document: 'Document',
  enforcement_case: 'Case',
  rtk_request: 'Right-to-Know request',
}
const DEFAULT_ZONE = 'America/New_York'

function Subject({ row }: { row: HoldListRow }) {
  const label = row.subject === '' ? 'Record no longer found' : row.subject
  return row.href === null ? label : <Link href={row.href}>{label}</Link>
}

function ReleaseHold({ holdId }: { holdId: string }) {
  return (
    <details>
      <summary>Release</summary>
      <ActionForm action={releaseHoldAction} submitLabel="Release hold">
        <input type="hidden" name="holdId" value={holdId} />
        <TextField label="Release reason (at least 10 characters)" name="reason" required />
      </ActionForm>
    </details>
  )
}

function PlaceHold() {
  return (
    <details>
      <summary>Place a hold</summary>
      <ActionForm action={placeHoldAction} submitLabel="Place hold">
        <SelectField label="Hold on" name="targetKind" options={TARGETS} />
        <TextField
          label="Application number, project title, or document title"
          name="targetRef"
          required
        />
        <TextField label="Reason (at least 10 characters)" name="reason" required />
      </ActionForm>
    </details>
  )
}

function emptyText(state: HoldState): string {
  return state === 'active'
    ? 'No record is on hold. Place a hold below when litigation or a records request needs one.'
    : 'No hold has been released yet.'
}

export default async function HoldsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>
}) {
  const { params, state, sort } = readHoldView(await searchParams)
  const ctx = await requireStaffContext()
  const list = await listHoldTable(ctx.db, ctx.actor, { state, sort }, ctx.signal)
  if (!list.ok) return <NoPermission title="Legal holds" action="manage legal holds" />
  const town = await getTownSettings(ctx.db, ctx.signal)
  const zone = town.ok ? town.value.timeZone : DEFAULT_ZONE
  const links = sortLinks(HOLDS_PATH, params, HOLD_SORT, sort)
  const tabs = filterTabs(HOLDS_PATH, params, {
    param: 'state',
    label: 'Holds',
    defaultTab: 'active',
    options: [
      { value: 'active', label: 'Active', count: list.value.counts.get('active') ?? 0 },
      { value: 'released', label: 'Released', count: list.value.counts.get('released') ?? 0 },
    ],
  })
  const { rows } = list.value
  return (
    <main data-wide="">
      <h1>Legal holds</h1>
      <p>
        A hold on a project, application, or document blocks disposition of everything under it.
        Newest hold first.
      </p>
      <FilterTabs label="Holds" tabs={tabs} />
      <div className="table-panel">
        {rows.length === 0 ? (
          <p className="px-5 py-8">{emptyText(state)}</p>
        ) : (
          <table className="w-full min-w-[44rem] text-left">
            <thead>
              <tr>
                <SortHeader label="Subject" link={links.subject} />
                <SortHeader label="Kind" link={links.kind} />
                <SortHeader label="Reason" link={links.reason} />
                <SortHeader label="Placed" link={links.placed} />
                <th scope="col">
                  {state === 'active' ? <span className="sr-only">Release</span> : 'Released'}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Subject row={row} />
                  </td>
                  <td className="whitespace-nowrap">{KIND_LABELS[row.targetKind]}</td>
                  <td>{row.reason}</td>
                  <td className="whitespace-nowrap">{formatInstant(row.placedAt, zone)}</td>
                  <td>
                    {row.releasedAt === null ? (
                      <ReleaseHold holdId={row.id} />
                    ) : (
                      `${formatInstant(row.releasedAt, zone)}: ${row.releaseReason ?? ''}`
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <PlaceHold />
    </main>
  )
}
