import type { Metadata } from 'next'
import { StatusChip } from '@/components/StatusChip'
import { SettingsHeader } from '@/components/settings/SettingsHeader'
import { NoPermission } from '@/components/staff/NoPermission'
import type { TownSectionRow } from '@/db/schema'
import { PROVISION_KIND_LABELS } from '@/features/enforcement/labels'
import { loadSectionListView } from '@/features/enforcement/sections/sectionListView'
import type { TypedRef } from '@/features/enforcement/sections/suggestions'
import { requireStaffContext } from '@/server/requireStaff'
import { AddSection, AddTypedSection, EditSection, RetireSection } from './SectionForms'

export const metadata: Metadata = { title: 'Sections for findings' }

export const dynamic = 'force-dynamic'

const LEAD =
  'Ordinance and code sections staff cite in enforcement findings. They are suggested by kind when a finding is recorded, along with sections used before, conditions on the parcel and the state building code list. A section not on any list can still be typed.'

function SectionRow({ row }: { row: TownSectionRow }) {
  return (
    <tr className="align-top">
      <td className="min-w-[8rem]">{PROVISION_KIND_LABELS[row.provisionKind]}</td>
      <td className="min-w-[12rem] font-semibold">{row.reference}</td>
      <td className="min-w-[10rem]">
        {row.title === '' ? <span className="text-muted-foreground">None</span> : row.title}
      </td>
      <td className="whitespace-nowrap">
        <StatusChip
          status={row.active ? 'passed' : 'neutral'}
          label={row.active ? 'Active' : 'Retired'}
        />
      </td>
      <td className="min-w-[9rem]">
        {row.active ? (
          <div className="row-actions">
            <EditSection sectionId={row.id} values={row} />
            <RetireSection sectionId={row.id} reference={row.reference} />
          </div>
        ) : null}
      </td>
    </tr>
  )
}

function SectionTable({ rows }: { rows: TownSectionRow[] }) {
  if (rows.length === 0) return <p>No sections on the list yet.</p>
  return (
    <div className="table-panel">
      <table className="w-full min-w-[40rem] table-auto text-sm">
        <caption className="sr-only">Sections for findings</caption>
        <thead>
          <tr>
            <th scope="col">Kind</th>
            <th scope="col">Section</th>
            <th scope="col">Short title</th>
            <th scope="col">Status</th>
            <th scope="col">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <SectionRow key={row.id} row={row} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function usedPhrase(count: number): string {
  return count === 1 ? 'Used once' : `Used ${String(count)} times`
}

function TypedNotListed({ refs }: { refs: TypedRef[] }) {
  return (
    <section data-plain aria-labelledby="typed-not-listed" className="mt-8 space-y-3">
      <h2 id="typed-not-listed">Typed in findings, not on the list</h2>
      {refs.length === 0 ? (
        <p>Every section typed in a finding is on this list or the state building code list.</p>
      ) : (
        <ul className="list-none space-y-2 p-0">
          {refs.map((r) => (
            <li
              key={`${r.kind}:${r.ref}`}
              className="record-item flex flex-wrap items-start justify-between gap-2"
            >
              <div>
                <p className="m-0 font-medium">{r.ref}</p>
                <p className="m-0 text-sm text-muted-foreground">
                  {`${PROVISION_KIND_LABELS[r.kind]}. ${usedPhrase(r.count)}.`}
                </p>
              </div>
              <AddTypedSection kind={r.kind} reference={r.ref} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default async function SectionsSettingsPage() {
  const ctx = await requireStaffContext()
  const view = await loadSectionListView(ctx.db, ctx.actor, ctx.signal)
  if (view === null) return <NoPermission title="Sections for findings" action="change settings" />
  return (
    <main data-wide="">
      <SettingsHeader title="Sections for findings" lead={LEAD} action={<AddSection />} />
      <SectionTable rows={view.rows} />
      <TypedNotListed refs={view.typedNotListed} />
    </main>
  )
}
