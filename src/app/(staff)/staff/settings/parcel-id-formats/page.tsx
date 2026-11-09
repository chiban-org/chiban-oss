import type { Metadata } from 'next'
import { StatusChip } from '@/components/StatusChip'
import { SettingsHeader } from '@/components/settings/SettingsHeader'
import { NoPermission } from '@/components/staff/NoPermission'
import { type IdFormatRow, listIdFormats } from '@/features/parcels/idFormatAdmin'
import { requireStaffContext } from '@/server/requireStaff'
import { AddFormat, DeleteFormat, EditFormat, ShowFormat } from './FormatForms'

export const metadata: Metadata = { title: 'Parcel ID formats' }

export const dynamic = 'force-dynamic'

const LEAD =
  'The ID numbers your town uses for a parcel, such as the assessor number from CAMA and the map-lot ID from GIS. Imports use these formats to match records to parcels, and one of them is the ID shown on parcel pages.'

function usedPhrase(row: IdFormatRow): string {
  if (row.aliasCount > 0)
    return row.aliasCount === 1 ? '1 parcel ID' : `${String(row.aliasCount)} parcel IDs`
  return row.inUse ? 'Used by imports or links' : 'Not used yet'
}

function shapePhrase(row: IdFormatRow): string {
  if (row.kind === 'free_text') return 'Any text.'
  if (row.width === null) return 'Digits only.'
  return `Exactly ${String(row.width)} digits, counting leading zeros.`
}

function FormatRowView({ row }: { row: IdFormatRow }) {
  return (
    <tr className="align-top">
      <td className="min-w-[10rem] font-semibold">{row.label}</td>
      <td className="min-w-[10rem]">{shapePhrase(row)}</td>
      <td className="whitespace-nowrap">{usedPhrase(row)}</td>
      <td className="whitespace-nowrap">
        {row.isDisplay ? <StatusChip status="passed" label="Shown on parcels" /> : null}
      </td>
      <td className="min-w-[8rem]">
        <div className="row-actions">
          <EditFormat
            formatKey={row.key}
            values={{ label: row.label, kind: row.kind, width: row.width }}
          />
          {row.isDisplay ? null : <ShowFormat formatKey={row.key} label={row.label} />}
          {row.isDisplay || row.inUse ? null : (
            <DeleteFormat formatKey={row.key} label={row.label} />
          )}
        </div>
      </td>
    </tr>
  )
}

export default async function ParcelIdFormatsPage() {
  const ctx = await requireStaffContext()
  const listed = await listIdFormats(ctx.db, ctx.actor, ctx.signal)
  if (!listed.ok) return <NoPermission title="Parcel ID formats" action="change settings" />
  return (
    <main data-wide="">
      <SettingsHeader title="Parcel ID formats" lead={LEAD} action={<AddFormat />} />
      {listed.value.length === 0 ? (
        <p>
          No formats yet. Add one before importing parcels, CAMA data or scanned property files.
        </p>
      ) : (
        <div className="table-panel">
          <table className="w-full min-w-[32rem] table-auto text-sm">
            <caption className="sr-only">Parcel ID formats</caption>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Shape</th>
                <th scope="col">In use</th>
                <th scope="col">Display</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {listed.value.map((row) => (
                <FormatRowView key={row.key} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
