import Link from 'next/link'
import { ActionForm } from '@/components/ActionForm'
import type { RostersView } from '@/features/rosters/rosterView'
import { endRestrictionAction } from './actions'
import { EditAssociation, EditHolder, EditPark } from './RosterForms'

function ParcelLink({ parcelId, label }: { parcelId: string; label: string }) {
  return (
    <Link href={`/staff/parcels/${parcelId}`} className="font-semibold tabular-nums">
      {label}
    </Link>
  )
}

function ActionsHeader() {
  return (
    <th scope="col">
      <span className="sr-only">Actions</span>
    </th>
  )
}

export function AssociationTable({
  rows,
  today,
}: {
  rows: RostersView['associations']
  today: string
}) {
  return (
    <div className="table-panel">
      <table className="w-full min-w-[40rem] text-sm">
        <caption className="sr-only">Condominium association rosters</caption>
        <thead>
          <tr>
            <th scope="col">Association</th>
            <th scope="col">Parcel</th>
            <th scope="col">Officers</th>
            <th scope="col">Current as of</th>
            <ActionsHeader />
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.parcelId} className="align-top">
              <td className="font-semibold">{a.name}</td>
              <td>
                <ParcelLink parcelId={a.parcelId} label={a.parcel} />
              </td>
              <td>{a.officers.join('; ')}</td>
              <td className="whitespace-nowrap">{a.asOfText}</td>
              <td>
                <EditAssociation row={a} today={today} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ParkTable({ rows, today }: { rows: RostersView['parks']; today: string }) {
  return (
    <div className="table-panel">
      <table className="w-full min-w-[44rem] text-sm">
        <caption className="sr-only">Manufactured housing park rosters</caption>
        <thead>
          <tr>
            <th scope="col">Park</th>
            <th scope="col">Parcel</th>
            <th scope="col">Owner</th>
            <th scope="col">Tenants</th>
            <th scope="col">Current as of</th>
            <ActionsHeader />
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.parcelId} className="align-top">
              <td className="font-semibold">{p.name}</td>
              <td>
                <ParcelLink parcelId={p.parcelId} label={p.parcel} />
              </td>
              <td>
                <Link
                  href={`/staff/parcels?q=${encodeURIComponent(p.owner)}`}
                  aria-label={`Search parcels owned by ${p.owner}`}
                >
                  {p.owner}
                </Link>
              </td>
              <td>{p.tenants.join('; ')}</td>
              <td className="whitespace-nowrap">{p.asOfText}</td>
              <td>
                <EditPark row={p} today={today} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function RestrictionTable({
  rows,
  today,
}: {
  rows: RostersView['restrictions']
  today: string
}) {
  return (
    <div className="table-panel">
      <table className="w-full min-w-[44rem] text-sm">
        <caption className="sr-only">Easement and restriction holders</caption>
        <thead>
          <tr>
            <th scope="col">Holder</th>
            <th scope="col">Kind</th>
            <th scope="col">Parcel</th>
            <th scope="col">Recorded at</th>
            <th scope="col">Status</th>
            <ActionsHeader />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="align-top">
              <td className="font-semibold">{r.holder}</td>
              <td>{r.kindText}</td>
              <td>
                <ParcelLink parcelId={r.parcelId} label={r.parcel} />
              </td>
              <td>{r.reference}</td>
              <td>
                {r.endedText === null ? (
                  <ActionForm
                    action={endRestrictionAction}
                    submitLabel="Mark as ended today"
                    confirm={{
                      title: 'Mark this holding as ended today?',
                      body: `${r.holder} is recorded as no longer holding it from today.`,
                      confirmLabel: 'Mark as ended',
                    }}
                    compact
                  >
                    <input type="hidden" name="holdingId" value={r.id} />
                    <input type="hidden" name="endedOn" value={today} />
                  </ActionForm>
                ) : (
                  `Ended ${r.endedText}`
                )}
              </td>
              <td>
                <EditHolder row={r} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
