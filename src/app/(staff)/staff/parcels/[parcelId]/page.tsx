import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ActionForm } from '@/components/ActionForm'
import { DocumentPanel } from '@/components/documents/DocumentPanel'
import { ParcelFileUploader } from '@/components/documents/ParcelFileUploader'
import { LinkedParcelMap } from '@/components/map/LinkedParcelMap'
import { HonestText } from '@/components/parcels/HonestText'
import { RecordsSection } from '@/components/parcels/RecordsSection'
import { StatusChip } from '@/components/StatusChip'
import { BalanceDueNotice } from '@/components/staff/BalanceDueNotice'
import { TextField } from '@/components/staff/fields'
import { Button } from '@/components/ui/button'
import { hasCapability } from '@/features/authz/capabilities'
import { loadPanelDocuments } from '@/features/documents/panelData'
import { bboxOfGeometry, configuredOverlayLayers } from '@/features/gis/extent'
import { returnedCheckNoticesForParcel } from '@/features/ledger/balanceNotice'
import { loadPack } from '@/features/packs/loadPack'
import { lineageEventText, retiredText } from '@/features/parcels/parcelText'
import { getStaffParcelView } from '@/features/parcels/staffParcelView'
import { getTownSettings } from '@/features/town/settings'
import { requireStaffContext } from '@/server/requireStaff'
import { createStaffUploadIntentAction, finalizeStaffUploadAction } from '../../records/actions'
import { PANEL_ACTIONS } from '../../records/panelActions'
import { carryForwardAction, createAliasOverrideAction } from './actions'

interface ParcelPageProps {
  params: Promise<{ parcelId: string }>
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function LayerBanner({ state, text }: { state: string; text: string }) {
  if (state === 'fresh') return null
  return (
    <p role="status" className="my-3 rounded-md bg-highlight px-3 py-2 text-sm">
      {text}
    </p>
  )
}

export default async function StaffParcelPage({ params }: ParcelPageProps) {
  const { parcelId } = await params
  if (!UUID.test(parcelId)) notFound()
  const ctx = await requireStaffContext()
  const result = await getStaffParcelView(ctx.db, ctx.actor, parcelId, new Date(), ctx.signal)
  if (!result.ok) notFound()
  const view = result.value
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

  return (
    <main>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1>{displayId}</h1>
        <Button asChild>
          <Link href={`/staff/parcels/lineage/new?parent=${encodeURIComponent(displayId)}`}>
            Record lineage event
          </Link>
        </Button>
      </div>
      {view.status === 'retired' ? (
        <p>
          <StatusChip status="neutral" label={retiredText(view.retiredOn)} />
        </p>
      ) : null}
      <BalanceDueNotice notices={balanceNotices} linkApplications />
      <LayerBanner state={view.layer.state} text={layerText} />
      <dl className="my-4 grid grid-cols-[10rem_1fr] gap-y-2">
        <dt className="font-semibold">Site address</dt>
        <dd>
          <HonestText value={view.siteAddress} timeZone={timeZone} />
        </dd>
        <dt className="font-semibold">Owner</dt>
        <dd>
          <HonestText value={view.owner} timeZone={timeZone} />
        </dd>
        <dt className="font-semibold">Mailing address</dt>
        <dd>
          <HonestText value={view.mailingAddress} timeZone={timeZone} />
        </dd>
        <dt className="font-semibold">Area</dt>
        <dd>
          <HonestText value={view.areaAcres} format={(n) => `${n} acres`} timeZone={timeZone} />
        </dd>
        <dt className="font-semibold">Open exceptions</dt>
        <dd>
          {view.openExceptions === 0 ? (
            'None'
          ) : (
            <Link
              href="/staff/gis/exceptions"
              className="text-action underline"
            >{`${view.openExceptions} open`}</Link>
          )}
        </dd>
      </dl>
      <h2>IDs</h2>
      <table className="mb-6 w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Format</th>
            <th>Value</th>
            <th>Status</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          {view.aliases.map((a) => (
            <tr key={`${a.format}:${a.value}:${a.status}`} className="border-b">
              <td className="py-2">{a.label}</td>
              <td>{a.value}</td>
              <td>{a.status === 'retired' ? retiredText(a.retiredOn) : 'Active'}</td>
              <td>{a.source}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {geometry === null ? null : (
        <LinkedParcelMap
          hrefBase="/staff/parcels/"
          selectedParcelId={parcelId}
          bbox={bboxOfGeometry(geometry)}
          layers={overlays}
          basemapRasterUrl={town.ok ? town.value.basemapRasterUrl : null}
          basemapAttribution={town.ok ? town.value.basemapAttribution : null}
        />
      )}
      <DocumentPanel
        documents={parcelDocuments}
        canPublish={canPublish}
        canManage={canManage}
        actions={PANEL_ACTIONS}
        target={{ kind: 'parcel', id: parcelId }}
      />
      {canManage ? (
        <section aria-label="Add a parcel file">
          <h3>Add a parcel file</h3>
          <ParcelFileUploader
            parcelId={parcelId}
            series={series}
            actions={{
              createIntent: createStaffUploadIntentAction,
              finalize: finalizeStaffUploadAction,
            }}
          />
        </section>
      ) : null}
      <h2 className="mt-6">Lineage</h2>
      {view.lineage.parents.length + view.lineage.children.length === 0 ? (
        <p>No lineage events for this parcel.</p>
      ) : (
        <ul>
          {[
            ...view.lineage.parents.map((p) => ({ ...p, rel: 'Parent' })),
            ...view.lineage.children.map((c) => ({ ...c, rel: 'Child' })),
          ].map((l) => (
            <li key={`${l.eventId}:${l.parcelId}`}>
              {`${l.rel} lot `}
              <Link href={`/staff/parcels/${l.parcelId}`} className="text-action underline">
                {l.displayId ?? 'No map-lot ID'}
              </Link>
              {`, ${lineageEventText(l.eventKind, l.effectiveDate)}`}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-6">
        <RecordsSection
          history={view.history}
          parcelHrefBase="/staff/parcels/"
          renderAction={(record) =>
            record.linkId === undefined ? null : (
              <ActionForm action={carryForwardAction} submitLabel="Carry forward to this parcel">
                <input type="hidden" name="linkId" value={record.linkId} />
                <input type="hidden" name="toParcelId" value={parcelId} />
              </ActionForm>
            )
          }
        />
      </div>
      <h2 className="mt-6">Override an ID</h2>
      <ActionForm
        action={createAliasOverrideAction}
        submitLabel="Save override"
        className="max-w-md"
      >
        <input type="hidden" name="parcelRef" value={displayId} />
        <TextField label="Format key" name="format" required hint="For example cama15 or gis12." />
        <TextField label="ID value" name="value" required />
        <TextField label="Reason" name="reason" required />
        <TextField label="Expires on" name="expiresOn" type="date" />
      </ActionForm>
    </main>
  )
}
