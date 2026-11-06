import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ActionForm } from '@/components/ActionForm'
import { DocumentPanel } from '@/components/documents/DocumentPanel'
import { ParcelFileUploader } from '@/components/documents/ParcelFileUploader'
import { FactList, PageHeader } from '@/components/layout/PageHeader'
import { RecordLayout } from '@/components/layout/RecordLayout'
import { splitPanels } from '@/components/layout/splitPanels'
import { LinkedParcelMap } from '@/components/map/LinkedParcelMap'
import { HonestText } from '@/components/parcels/HonestText'
import { ParcelRecordsPanel } from '@/components/parcels/ParcelRecordsPanel'
import { StatusChip } from '@/components/StatusChip'
import { BalanceDueNotice } from '@/components/staff/BalanceDueNotice'
import { TextField } from '@/components/staff/fields'
import { Button } from '@/components/ui/button'
import { hasCapability } from '@/features/authz/capabilities'
import type { RawSearchParams } from '@/features/dataTable/params'
import { loadPanelDocuments } from '@/features/documents/panelData'
import { bboxOfGeometry, configuredOverlayLayers } from '@/features/gis/extent'
import { returnedCheckNoticesForParcel } from '@/features/ledger/balanceNotice'
import { loadPack } from '@/features/packs/loadPack'
import { aliasSourceText, lineageEventText, retiredText } from '@/features/parcels/parcelText'
import { buildRecordTable } from '@/features/parcels/recordTable'
import { arrangeRecordTable, readRecordTableView } from '@/features/parcels/recordTableView'
import { getStaffParcelView } from '@/features/parcels/staffParcelView'
import { loadParcelContacts } from '@/features/rosters/parcelContacts'
import { getTownSettings } from '@/features/town/settings'
import { requireStaffContext } from '@/server/requireStaff'
import { createStaffUploadIntentAction, finalizeStaffUploadAction } from '../../records/actions'
import { PANEL_ACTIONS } from '../../records/panelActions'
import { carryForwardAction } from './actions'
import { noticePanel } from './NoticeGoesTo'
import { ParcelIds } from './ParcelIds'

interface ParcelPageProps {
  params: Promise<{ parcelId: string }>
  searchParams: Promise<RawSearchParams>
}

const MAP_HINT = 'The map is a visual aid. Select a neighboring parcel on it to open that parcel.'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function LayerBanner({ state, text }: { state: string; text: string }) {
  if (state === 'fresh') return null
  return (
    <p role="status" className="my-3 rounded-md bg-highlight px-3 py-2 text-sm">
      {text}
    </p>
  )
}

export async function generateMetadata({ params }: ParcelPageProps): Promise<Metadata> {
  const { parcelId } = await params
  if (!UUID.test(parcelId)) return { title: 'Parcel' }
  const ctx = await requireStaffContext()
  const result = await getStaffParcelView(ctx.db, ctx.actor, parcelId, new Date(), ctx.signal)
  if (!result.ok) return { title: 'Parcel' }
  const id = result.value.aliases.find((a) => a.status === 'active')?.value ?? 'No map-lot ID'
  return { title: `Parcel ${id}` }
}

export default async function StaffParcelPage({ params, searchParams }: ParcelPageProps) {
  const { parcelId } = await params
  if (!UUID.test(parcelId)) notFound()
  const ctx = await requireStaffContext()
  const result = await getStaffParcelView(ctx.db, ctx.actor, parcelId, new Date(), ctx.signal)
  if (!result.ok) notFound()
  const view = result.value
  const records = arrangeRecordTable(
    buildRecordTable(view.history, parcelId),
    readRecordTableView(await searchParams),
    `/staff/parcels/${parcelId}`,
  )
  const balanceNotices = await returnedCheckNoticesForParcel(ctx.db, parcelId, ctx.signal)
  const town = await getTownSettings(ctx.db, ctx.signal)
  const overlays = await configuredOverlayLayers(ctx.db, ctx.signal)
  const timeZone = town.ok ? town.value.timeZone : 'America/New_York'
  const parcelDocuments = await loadPanelDocuments(
    ctx.db,
    ctx.actor,
    { kind: 'parcel', id: parcelId },
    ctx.signal,
  )
  const canPublish = await hasCapability(ctx.db, ctx.actor.userId, 'document.publish', ctx.signal)
  const canManage = await hasCapability(ctx.db, ctx.actor.userId, 'document.manage', ctx.signal)
  const canManageParcel = await hasCapability(ctx.db, ctx.actor.userId, 'parcel.manage', ctx.signal)
  const contacts = await loadParcelContacts(ctx.db, ctx.actor, { parcelId }, ctx.signal)
  const series = loadPack().recordSeries.map((s) => ({
    key: s.key,
    label: s.label,
    citation: s.citation.label,
  }))
  const displayId = view.aliases.find((a) => a.status === 'active')?.value ?? 'No map-lot ID'
  const geometry =
    view.geometry.state === 'known' || view.geometry.state === 'stale' ? view.geometry.value : null
  const layerText = {
    never_imported: 'The parcel layer has never been imported, so these fields are unknown.',
    import_failed:
      'The last parcel layer import failed. Values shown are from the last good import.',
    stale: `Parcel data is older than ${view.layer.staleAfterDays} days.`,
    not_configured: 'The parcel layer is not configured.',
    fresh: '',
  }[view.layer.state]

  const lineage = [
    ...view.lineage.parents.map((p) => ({ ...p, rel: 'Parent' })),
    ...view.lineage.children.map((c) => ({ ...c, rel: 'Child' })),
  ]
  const parts = splitPanels([
    noticePanel(contacts, {
      parcelId,
      displayId,
      status: view.status,
      siteAddress: view.siteAddress,
    }),
    {
      empty: false,
      node:
        geometry === null ? null : (
          <LinkedParcelMap
            key="map"
            hrefBase="/staff/parcels/"
            selectedParcelId={parcelId}
            bbox={bboxOfGeometry(geometry)}
            layers={overlays}
            basemapRasterUrl={town.ok ? town.value.basemapRasterUrl : null}
            basemapAttribution={town.ok ? town.value.basemapAttribution : null}
            hint={MAP_HINT}
          />
        ),
    },
    {
      empty: false,
      node: (
        <ParcelRecordsPanel
          key="records"
          records={records}
          parcelHrefBase="/staff/parcels/"
          renderAction={(record) =>
            record.linkId === undefined || !canManageParcel ? null : (
              <ActionForm action={carryForwardAction} submitLabel="Carry forward to this parcel">
                <input type="hidden" name="linkId" value={record.linkId} />
                <input type="hidden" name="toParcelId" value={parcelId} />
              </ActionForm>
            )
          }
        />
      ),
    },
    {
      empty: parcelDocuments.length === 0,
      node: (
        <DocumentPanel
          key="documents"
          documents={parcelDocuments}
          canPublish={canPublish}
          canManage={canManage}
          actions={PANEL_ACTIONS}
          target={{ kind: 'parcel', id: parcelId }}
        >
          {canManage ? (
            <details>
              <summary>Add a parcel file</summary>
              <ParcelFileUploader
                parcelId={parcelId}
                series={series}
                actions={{
                  createIntent: createStaffUploadIntentAction,
                  finalize: finalizeStaffUploadAction,
                }}
              />
            </details>
          ) : null}
        </DocumentPanel>
      ),
    },
    {
      empty: lineage.length === 0,
      node: (
        <section key="lineage" aria-label="Lineage">
          <h2>Lineage</h2>
          {lineage.length === 0 ? (
            <p>No lineage events for this parcel.</p>
          ) : (
            <ul>
              {lineage.map((l) => (
                <li key={`${l.eventId}:${l.parcelId}`}>
                  {`${l.rel} lot `}
                  <Link href={`/staff/parcels/${l.parcelId}`}>
                    {l.displayId ?? 'No map-lot ID'}
                  </Link>
                  {`, ${lineageEventText(l.eventKind, l.effectiveDate)}`}
                </li>
              ))}
            </ul>
          )}
        </section>
      ),
    },
    {
      empty: false,
      node: (
        <ParcelIds
          key="ids"
          aliases={view.aliases}
          displayId={displayId}
          canManage={canManageParcel}
        />
      ),
    },
  ])
  return (
    <main>
      <PageHeader
        kicker="Parcel"
        title={displayId}
        status={
          view.status === 'retired' ? (
            <StatusChip status="neutral" label={retiredText(view.retiredOn)} />
          ) : undefined
        }
        lead={<HonestText value={view.siteAddress} timeZone={timeZone} />}
      />
      <RecordLayout
        rail={
          <>
            <div className="rail-card empty:hidden">
              <BalanceDueNotice notices={balanceNotices} linkApplications />
              <LayerBanner state={view.layer.state} text={layerText} />
              {canManageParcel ? (
                <Button asChild className="w-full">
                  <Link href={`/staff/parcels/lineage/new?parent=${encodeURIComponent(displayId)}`}>
                    Record lineage event
                  </Link>
                </Button>
              ) : null}
            </div>
            <div className="rail-card">
              <FactList
                stacked
                facts={[
                  { label: 'Owner', value: <HonestText value={view.owner} timeZone={timeZone} /> },
                  {
                    label: 'Mailing address',
                    value: <HonestText value={view.mailingAddress} timeZone={timeZone} />,
                  },
                  {
                    label: 'Area',
                    value: (
                      <HonestText
                        value={view.areaAcres}
                        format={(n) => `${n} acres`}
                        timeZone={timeZone}
                      />
                    ),
                  },
                  {
                    label: 'Open exceptions',
                    value:
                      view.openExceptions === 0 ? (
                        'None'
                      ) : (
                        <Link href="/staff/gis/exceptions">{`${view.openExceptions} open`}</Link>
                      ),
                  },
                ]}
              />
            </div>
          </>
        }
        empty={parts.empty}
      >
        {parts.filled}
      </RecordLayout>
    </main>
  )
}
