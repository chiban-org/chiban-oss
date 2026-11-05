import { NH_ABUTTER_PARAMS } from '@packs/nh/abutters/params'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ProjectionMap } from '@/components/abutters/ProjectionMap'
import { PageHeader } from '@/components/layout/PageHeader'
import { RecordLayout } from '@/components/layout/RecordLayout'
import { StatusChip } from '@/components/StatusChip'
import { NoPermission } from '@/components/staff/NoPermission'
import { type ListView, loadListView } from '@/features/abutters/listView'
import { recordExists } from '@/features/access/recordExists'
import { getTownSettings } from '@/features/town/settings'
import { requireStaffContext } from '@/server/requireStaff'
import { ListRail } from './listRail'
import { CandidatesSection, RecipientsSection } from './listSections'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function chipFor(view: ListView): 'passed' | 'neutral' | 'overdue' {
  if (view.status === 'issued') return 'passed'
  return view.status === 'draft' ? 'neutral' : 'overdue'
}

function Incomplete({ view }: { view: ListView }) {
  if (view.incomplete.length === 0) return null
  return (
    <section aria-label="Before this list can be issued" role="alert">
      <h2>Before this list can be issued</h2>
      <ul>
        {view.incomplete.map((line) => (
          <li key={line.text}>
            {line.text}
            {line.href === null ? null : (
              <>
                {' '}
                <Link href={line.href}>{line.linkText}</Link>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

function Sources({ view }: { view: ListView }) {
  return (
    <section aria-label="Where the data came from">
      <h2>Where the data came from</h2>
      <ul>
        {view.layerNotes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </section>
  )
}

export default async function AbutterListPage({ params }: { params: Promise<{ listId: string }> }) {
  const { listId } = await params
  if (!UUID.test(listId)) notFound()
  const ctx = await requireStaffContext()
  const view = await loadListView(ctx.db, ctx.actor, listId, ctx.signal)
  if (view === null) {
    if (await recordExists(ctx.db, 'abutterList', listId, ctx.signal)) {
      return <NoPermission title="Abutter list" action="see abutter lists" />
    }
    notFound()
  }
  const town = await getTownSettings(ctx.db, ctx.signal)
  return (
    <main>
      <PageHeader
        kicker={
          <Link href={`/staff/applications/${view.applicationId}`}>{view.applicationNumber}</Link>
        }
        title={`Abutter list, version ${view.version}`}
        status={<StatusChip status={chipFor(view)} label={view.statusText} />}
      />
      <RecordLayout rail={<ListRail view={view} />}>
        <Incomplete view={view} />
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
        <Sources view={view} />
      </RecordLayout>
    </main>
  )
}
