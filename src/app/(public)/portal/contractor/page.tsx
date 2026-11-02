import Link from 'next/link'
import { StatusChip } from '@/components/StatusChip'
import { applicationChipStatus } from '@/features/applications/chipStatus'
import { stateLabel } from '@/features/applications/stateLabel'
import { listContractorProjects } from '@/features/contractors/dashboard'
import { honestText } from '@/features/honest/honest'
import { formatCivilDate } from '@/lib/formatDate'
import { requirePortalContext } from '@/server/requirePortal'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25

export default async function ContractorDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>
}) {
  const { cursor } = await searchParams
  const ctx = await requirePortalContext('/portal/contractor')
  const page = await listContractorProjects(
    ctx.db,
    ctx.actor,
    { limit: PAGE_SIZE, ...(cursor === undefined ? {} : { cursor }) },
    ctx.signal,
  )
  return (
    <main>
      <h1>Your contractor projects</h1>
      {page.rows.length === 0 ? (
        <p>
          You have not claimed a project yet. Use the link in the email you were sent to claim one.
        </p>
      ) : (
        <ul className="divide-y">
          {page.rows.map((row) => (
            <li key={row.projectId} className="py-3">
              <p className="font-semibold">{row.title}</p>
              <p>{`${honestText(row.siteAddress, 'Address not on file')}${row.parcelDisplayId === null ? '' : `, parcel ${row.parcelDisplayId}`}`}</p>
              <ul className="mt-2 space-y-2">
                {row.applications.map((app) => (
                  <li key={app.applicationId} className="flex flex-wrap items-center gap-3">
                    <Link
                      href={`/portal/applications/${app.applicationId}`}
                      className="tap-target inline-flex items-center underline"
                    >{`${app.typeLabel} ${app.number}`}</Link>
                    <StatusChip
                      status={applicationChipStatus(app.state)}
                      label={stateLabel(app.state)}
                    />
                    {app.issuedOn === null ? null : (
                      <span>{`Issued ${formatCivilDate(app.issuedOn)}`}</span>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
      {page.nextCursor === null ? null : (
        <Link
          href={`/portal/contractor?cursor=${encodeURIComponent(page.nextCursor)}`}
          className="tap-target inline-flex items-center underline"
        >
          Next page
        </Link>
      )}
    </main>
  )
}
