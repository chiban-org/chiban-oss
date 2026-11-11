import { hasFullRecordAccess } from '@/features/access/roles'
import { hasCapability } from '@/features/authz/capabilities'
import type { RawSearchParams } from '@/features/dataTable/params'
import { loadPanelDocuments } from '@/features/documents/panelData'
import { configuredOverlayLayers } from '@/features/gis/extent'
import { recordsInspection } from '@/features/inspections/visibility'
import { returnedCheckNoticesForParcel } from '@/features/ledger/balanceNotice'
import { loadPack } from '@/features/packs/loadPack'
import { loadLotConditions } from '@/features/parcels/lotConditions'
import { loadNextLotInspection } from '@/features/parcels/lotInspection'
import { loadNearbyParcels } from '@/features/parcels/nearbyParcels'
import { parcelViewFor } from '@/features/parcels/openGroups'
import { openItems, openNowSentence } from '@/features/parcels/openNow'
import { buildRecordTable } from '@/features/parcels/recordTable'
import { arrangeRecordTable, readRecordTableView } from '@/features/parcels/recordTableView'
import { getStaffParcelView, type StaffParcelView } from '@/features/parcels/staffParcelView'
import { loadNoticeRecipients, noticeRecipientsText } from '@/features/rosters/noticeRecipients'
import { loadParcelContacts } from '@/features/rosters/parcelContacts'
import { getTownSettings } from '@/features/town/settings'
import type { StaffContext } from '@/server/requireStaff'
import { todayInTimeZone } from '@/types/civilDate'

const FALLBACK_ZONE = 'America/New_York'

export const NO_MAP_LOT_ID = 'No map-lot ID'

function siteAddressOf(view: StaffParcelView): string | null {
  const v = view.siteAddress
  if (v.state === 'known' || v.state === 'stale') return v.value
  return v.state === 'import_failed' ? v.value : null
}

function layerTextOf(view: StaffParcelView): string {
  return {
    never_imported: 'The parcel layer has never been imported, so these fields are unknown.',
    import_failed:
      'The last parcel layer import failed. Values shown are from the last good import.',
    stale: `Parcel data is older than ${view.layer.staleAfterDays} days.`,
    not_configured: 'The parcel layer is not configured.',
    fresh: '',
  }[view.layer.state]
}

async function capabilitiesOf(ctx: StaffContext) {
  const can = (key: Parameters<typeof hasCapability>[2]) =>
    hasCapability(ctx.db, ctx.actor.userId, key, ctx.signal)
  const [publish, manageDocuments, manageParcel] = await Promise.all([
    can('document.publish'),
    can('document.manage'),
    can('parcel.manage'),
  ])
  return { publish, manageDocuments, manageParcel, fullRecords: hasFullRecordAccess(ctx.actor) }
}

export async function loadParcelPage(ctx: StaffContext, parcelId: string, raw: RawSearchParams) {
  const result = await getStaffParcelView(ctx.db, ctx.actor, parcelId, new Date(), ctx.signal)
  if (!result.ok) return null
  const view = result.value
  const table = buildRecordTable(view.history, parcelId)
  const town = await getTownSettings(ctx.db, ctx.signal)
  const timeZone = town.ok ? town.value.timeZone : FALLBACK_ZONE
  const today = todayInTimeZone(timeZone, new Date())
  const [can, conditions, next, nearby, recipients, contacts, documents, notices, overlays] =
    await Promise.all([
      capabilitiesOf(ctx),
      loadLotConditions(ctx.db, parcelId, ctx.signal),
      hasFullRecordAccess(ctx.actor)
        ? loadNextLotInspection(ctx.db, parcelId, ctx.signal)
        : Promise.resolve(null),
      view.geometry.state === 'known' || view.geometry.state === 'stale'
        ? loadNearbyParcels(ctx.db, parcelId, ctx.signal)
        : Promise.resolve([]),
      loadNoticeRecipients(ctx.db, { parcelId, today }, ctx.signal),
      loadParcelContacts(ctx.db, ctx.actor, { parcelId }, ctx.signal),
      loadPanelDocuments(ctx.db, ctx.actor, { kind: 'parcel', id: parcelId }, ctx.signal),
      returnedCheckNoticesForParcel(ctx.db, ctx.actor, parcelId, ctx.signal),
      configuredOverlayLayers(ctx.db, ctx.signal),
    ])
  return {
    parcelId,
    view,
    viewer: { id: ctx.actor.userId, page: parcelViewFor(ctx.actor.roles) },
    displayId: view.aliases.find((a) => a.status === 'active')?.value ?? NO_MAP_LOT_ID,
    siteAddress: siteAddressOf(view),
    layerText: layerTextOf(view),
    timeZone,
    today,
    can,
    records: arrangeRecordTable(table, readRecordTableView(raw), `/staff/parcels/${parcelId}`),
    rows: table.own,
    sentence: openNowSentence(table.own),
    items: openItems(table.own),
    conditions,
    next,
    recordsNext: next !== null && recordsInspection(ctx.actor, next.inspectorUserId),
    nearby,
    noticeTo: noticeRecipientsText(recipients),
    contacts,
    documents,
    notices,
    map: {
      overlays,
      basemapRasterUrl: town.ok ? town.value.basemapRasterUrl : null,
      basemapAttribution: town.ok ? town.value.basemapAttribution : null,
    },
    series: loadPack().recordSeries.map((s) => ({
      key: s.key,
      label: s.label,
      citation: s.citation.label,
    })),
  }
}

export type ParcelPageData = NonNullable<Awaited<ReturnType<typeof loadParcelPage>>>
