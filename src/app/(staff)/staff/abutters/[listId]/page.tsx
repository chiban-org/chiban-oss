import { NH_ABUTTER_PARAMS } from '@packs/nh/abutters/params'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ActionForm } from '@/components/ActionForm'
import { ProjectionMap } from '@/components/abutters/ProjectionMap'
import { StatusChip } from '@/components/StatusChip'
import { type ListView, loadListView } from '@/features/abutters/listView'
import { getTownSettings } from '@/features/town/settings'
import { requireStaffContext } from '@/server/requireStaff'
import { issueListAction } from '../actions'
import { CandidatesSection, CostSection, LabelLinks, RecipientsSection } from './listSections'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function chipFor(view: ListView): 'passed' | 'neutral' | 'overdue' {
  if (view.status === 'issued') return 'passed'
  return view.status === 'draft' ? 'neutral' : 'overdue'
}

function Header({ view }: { view: ListView }) {
  return (
    <>
      <p>
        <Link href={`/staff/applications/${view.applicationId}`} className="text-action underline">
          {`Back to ${view.applicationNumber}`}
        </Link>
      </p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1>{`Abutter list for ${view.applicationNumber}, version ${view.version}`}</h1>
        <StatusChip status={chipFor(view)} label={view.statusText} />
      </div>
      <p>
        {`Drawn ${view.drawnText}.`}
        {view.issuedText === null ? '' : ` Issued ${view.issuedText}.`}
        {view.fingerprint === null ? '' : ` Fingerprint ${view.fingerprint}.`}
      </p>
      <section aria-label="Where the data came from">
        <h2>Where the data came from</h2>
        <ul>
          {view.layerNotes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </section>
      {view.incomplete.length > 0 ? (
        <section aria-label="Before this list can be issued" role="alert">
          <h2>Before this list can be issued</h2>
          <ul>
            {view.incomplete.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  )
}

export default async function AbutterListPage({ params }: { params: Promise<{ listId: string }> }) {
  const { listId } = await params
  if (!UUID.test(listId)) notFound()
  const ctx = await requireStaffContext()
  const view = await loadListView(ctx.db, ctx.actor, listId, ctx.signal)
  if (view === null) notFound()
  const town = await getTownSettings(ctx.db, ctx.signal)
  return (
    <main className="space-y-6">
      <Header view={view} />
      {view.overlay === null ? null : (
        <section aria-label="Across the street or stream">
          <h2>Across the street or stream</h2>
          <ProjectionMap
            overlay={view.overlay}
            bbox={view.bbox}
            basemapRasterUrl={town.ok ? town.value.basemapRasterUrl : null}
            basemapAttribution={town.ok ? town.value.basemapAttribution : null}
            captureRadiusFt={NH_ABUTTER_PARAMS.captureRadiusFt}
          />
        </section>
      )}
      <CandidatesSection view={view} />
      <RecipientsSection view={view} />
      <CostSection view={view} />
      {view.canEdit ? (
        <ActionForm action={issueListAction} submitLabel="Issue list" variant="default">
          <input type="hidden" name="listId" value={view.listId} />
        </ActionForm>
      ) : null}
      {view.status === 'issued' ? <LabelLinks listId={view.listId} /> : null}
    </main>
  )
}
