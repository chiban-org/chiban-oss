import { NH_ABUTTER_PARAMS } from '@packs/nh/abutters/params'
import { asc, eq, inArray } from 'drizzle-orm'
import type { Db, Tx } from '@/db/client'
import { abutterListCandidates, abutterListRecipients, applications, parcels } from '@/db/schema'
import { applicantParcelIds } from '@/features/abutters/applicantParcels'
import { openIncomplete } from '@/features/abutters/draft'
import { type NoticeCostSummary, noticeCostSummary } from '@/features/abutters/noticeCosts'
import { type Overlay, projectionOverlay } from '@/features/abutters/overlay'
import { getList, type ListRow, type ListSnapshot } from '@/features/abutters/queries'
import { provenanceText, reasonText } from '@/features/abutters/reasonText'
import type { Recipient } from '@/features/abutters/resolution'
import { RECIPIENT_ROLE_LABELS } from '@/features/abutters/roles'
import type { Candidate } from '@/features/abutters/types'
import type { Actor } from '@/features/auth/actor'
import { getBoardSettings as loadBoardSettings } from '@/features/boards/boardSettings'
import type { LayerStatus } from '@/features/gis/layerStatus'
import { displayIdsFor } from '@/features/parcels/displayId'
import { mayManageAbutters } from '@/features/rosters/manage'
import { getTownSettings } from '@/features/town/settings'
import { formatCivilDate } from '@/lib/formatDate'
import { todayInTimeZone } from '@/types/civilDate'

export interface CandidateRow {
  parcelId: string
  parcelLabel: string
  owner: string
  reasons: string[]
  staffSelected: boolean
  excluded: boolean
  exclusionReason: string | null
}

export interface RecipientView {
  id: string
  name: string
  mailingAddress: string | null
  roles: string[]
  statusText: string
  provenance: string[]
  excluded: boolean
  exclusionReason: string | null
  needsDecision: boolean
  tenantDecided: boolean
  decisionText: string | null
  corrected: boolean
}

export interface ListView {
  listId: string
  applicationId: string
  applicationNumber: string
  version: number
  status: ListRow['status']
  statusText: string
  drawnText: string
  issuedText: string | null
  fingerprint: string | null
  layerNotes: string[]
  incomplete: string[]
  candidates: CandidateRow[]
  recipients: RecipientView[]
  attestedText: string | null
  overlay: Overlay | null
  bbox: [number, number, number, number] | null
  notice: NoticeCostSummary
  canEdit: boolean
  mailings: number
}

const STATUS_TEXT: Record<ListRow['status'], string> = {
  draft: 'Draft, not yet issued',
  issued: 'Issued',
  superseded: 'Replaced by a newer version',
  discarded: 'Discarded',
}

const LAYER_NAMES = {
  parcels: 'Parcel layer',
  roads: 'Road layer',
  water: 'Water layer',
  cama: 'Assessing layer',
}

function layerNote(name: string, status: LayerStatus, zone: string): string {
  if (
    status.lastSuccessAt === null ||
    status.state === 'import_failed' ||
    status.state === 'not_configured'
  ) {
    return `${name} has no usable import`
  }
  const when = formatCivilDate(todayInTimeZone(zone, new Date(status.lastSuccessAt)))
  const age =
    status.ageDays === null
      ? ''
      : `, ${status.ageDays} ${status.ageDays === 1 ? 'day' : 'days'} old`
  return `${name} imported ${when}${age}${status.state === 'stale' ? ', out of date' : ''}`
}

function boundsOf(overlay: Overlay): [number, number, number, number] | null {
  const coords: number[][] = []
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      if (typeof value[0] === 'number') coords.push(value as number[])
      else for (const item of value) visit(item)
    }
  }
  for (const f of overlay.features) visit((f.geometry as { coordinates?: unknown }).coordinates)
  if (coords.length === 0) return null
  const xs = coords.map((c) => c[0] ?? 0)
  const ys = coords.map((c) => c[1] ?? 0)
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}

function frozenView(data: Recipient, index: number): RecipientView {
  return {
    id: `frozen-${index}`,
    name: data.name,
    mailingAddress: data.mailingAddress,
    roles: data.roles.map((r) => RECIPIENT_ROLE_LABELS[r]),
    statusText: 'Complete',
    provenance: data.provenance.map(provenanceText),
    excluded: false,
    exclusionReason: null,
    needsDecision: false,
    tenantDecided: false,
    decisionText: null,
    corrected: data.provenance.some((p) => p.source === 'staff_entry'),
  }
}

function recipientView(row: typeof abutterListRecipients.$inferSelect): RecipientView {
  const data = row.data as Recipient
  const decision =
    row.qualifies === null
      ? null
      : `${row.qualifies ? 'Counts as an abutter' : 'Does not count as an abutter'}: ${row.decisionReason ?? ''}`
  return {
    id: row.id,
    name: data.name,
    mailingAddress: data.mailingAddress,
    roles: data.roles.map((r) => RECIPIENT_ROLE_LABELS[r]),
    statusText:
      data.status === 'needs_decision'
        ? row.qualifies === null
          ? 'Needs a staff decision'
          : 'Decided by staff'
        : data.status === 'incomplete_data'
          ? 'Missing name or address'
          : 'Complete',
    provenance: data.provenance.map(provenanceText),
    excluded: row.excluded,
    exclusionReason: row.exclusionReason,
    needsDecision: data.status === 'needs_decision' && row.qualifies === null,
    tenantDecided: data.status === 'needs_decision' && row.qualifies !== null,
    decisionText: decision,
    corrected: data.provenance.some((p) => p.source === 'staff_entry'),
  }
}

async function candidateRows(tx: Tx, listId: string): Promise<CandidateRow[]> {
  const rows = await tx
    .select()
    .from(abutterListCandidates)
    .where(eq(abutterListCandidates.listId, listId))
  const ids = rows.map((r) => r.parcelId)
  const labels = await displayIdsFor(tx, ids)
  const owners =
    ids.length === 0
      ? []
      : await tx
          .select({ id: parcels.id, owner: parcels.ownerName })
          .from(parcels)
          .where(inArray(parcels.id, ids))
  const ownerOf = new Map(owners.map((o) => [o.id, o.owner ?? 'Owner not on record']))
  const built = rows.map((r) => {
    const reasons = r.reasons as Candidate['reasons']
    return {
      parcelId: r.parcelId,
      parcelLabel: labels.get(r.parcelId) ?? 'Parcel',
      owner: ownerOf.get(r.parcelId) ?? 'Owner not on record',
      reasons: reasons.map(reasonText),
      staffSelected: reasons.some((x) => x.kind === 'staff_selected'),
      excluded: r.excluded,
      exclusionReason: r.exclusionReason,
    }
  })
  return built.sort(
    (a, b) =>
      Number(b.staffSelected) - Number(a.staffSelected) ||
      a.parcelLabel.localeCompare(b.parcelLabel),
  )
}

export async function loadListView(
  db: Db,
  actor: Actor,
  listId: string,
  signal: AbortSignal,
): Promise<ListView | null> {
  signal.throwIfAborted()
  if (!(await mayManageAbutters(db, actor.userId, signal))) return null
  return await db.transaction(async (tx) => {
    const list = await getList(tx, listId, signal)
    if (list === null) return null
    const [app] = await tx
      .select()
      .from(applications)
      .where(eq(applications.id, list.applicationId))
    const town = await getTownSettings(tx, signal)
    const zone = town.ok ? town.value.timeZone : 'UTC'
    const recipientRows = await tx
      .select()
      .from(abutterListRecipients)
      .where(eq(abutterListRecipients.listId, listId))
      .orderBy(asc(abutterListRecipients.position))
    const settings = (await loadBoardSettings(tx, signal)).abutters
    const parcelIds = await applicantParcelIds(tx, list.applicationId, signal)
    const showMap = list.status === 'draft' || list.status === 'issued'
    const overlay =
      showMap && settings.projectionEnabled
        ? await projectionOverlay(
            tx,
            parcelIds,
            NH_ABUTTER_PARAMS,
            settings.assumedRightOfWayFt,
            signal,
          )
        : null
    const layers = list.layers as Record<string, LayerStatus>
    const notes = (['parcels', 'roads', 'water'] as const).flatMap((key) => {
      const status = layers[key]
      return status === undefined ? [] : [layerNote(LAYER_NAMES[key], status, zone)]
    })
    const attested =
      list.crossingsAttestedAt === null
        ? null
        : `Staff confirmed on ${formatCivilDate(todayInTimeZone(zone, list.crossingsAttestedAt))} that streets and streams were reviewed.`
    const incomplete =
      list.status === 'draft' ? (await openIncomplete(tx, listId)).map((i) => i.detail) : []
    const recipients =
      list.snapshot === null
        ? recipientRows.map(recipientView)
        : (list.snapshot as ListSnapshot).recipients.map(frozenView)
    return {
      listId,
      applicationId: list.applicationId,
      applicationNumber: app?.number ?? '',
      version: list.version,
      status: list.status,
      statusText: STATUS_TEXT[list.status],
      drawnText: formatCivilDate(list.drawnOn),
      issuedText:
        list.issuedAt === null ? null : formatCivilDate(todayInTimeZone(zone, list.issuedAt)),
      fingerprint: list.snapshotSha256 === null ? null : list.snapshotSha256.slice(0, 12),
      layerNotes: notes,
      incomplete,
      candidates: await candidateRows(tx, listId),
      recipients,
      attestedText: attested,
      overlay,
      bbox: overlay === null ? null : boundsOf(overlay),
      notice: await noticeCostSummary(tx, list.applicationId, signal),
      canEdit: list.status === 'draft',
      mailings: new Set(
        recipients
          .filter((r) => !r.excluded && r.mailingAddress !== null)
          .map((r) => r.name + r.mailingAddress),
      ).size,
    }
  })
}
