import type { Metadata } from 'next'
import Link from 'next/link'
import { NoPermission } from '@/components/staff/NoPermission'
import { hasCapability } from '@/features/authz/capabilities'
import { listUnresolvedRecords, type UnresolvedRecordView } from '@/features/parcels/unresolvedView'
import { recordStaffContext } from '@/server/requireStaff'
import { ResolveForm } from './ResolveForm'

export const metadata: Metadata = { title: 'Unresolved records' }

function RecordCell({ link }: { link: UnresolvedRecordView }) {
  if (link.recordHref === null) return <>{link.record}</>
  return <Link href={link.recordHref}>{link.record}</Link>
}

function UnresolvedTable({ links }: { links: UnresolvedRecordView[] }) {
  return (
    <div className="table-panel">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th scope="col">Record</th>
            <th scope="col">Named ID</th>
            <th scope="col">ID type</th>
            <th scope="col">Link to parcel</th>
          </tr>
        </thead>
        <tbody>
          {links.map((link) => (
            <tr key={link.linkId}>
              <td>
                <RecordCell link={link} />
              </td>
              <td className="tabular-nums">{link.namedId}</td>
              <td>{link.idType}</td>
              <td>
                <ResolveForm linkId={link.linkId} record={link.record} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default async function StaffUnresolvedPage() {
  const ctx = await recordStaffContext()
  const mayLink =
    ctx !== null && (await hasCapability(ctx.db, ctx.actor.userId, 'parcel.manage', ctx.signal))
  if (ctx === null || !mayLink)
    return <NoPermission title="Unresolved records" action="see unresolved records" />
  const links = await listUnresolvedRecords(ctx.db, ctx.actor, ctx.signal)
  return (
    <main data-wide="">
      <h1>Unresolved records</h1>
      <p>
        These records name a parcel ID that is not in Chiban. They link automatically after an
        import brings the parcel in, or you can link them by hand. Newest first.
      </p>
      {links.length === 0 ? (
        <p className="mt-4">Every record is linked to a parcel.</p>
      ) : (
        <UnresolvedTable links={links} />
      )}
    </main>
  )
}
