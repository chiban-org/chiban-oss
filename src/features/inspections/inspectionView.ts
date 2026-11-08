import { and, eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import {
  type InspectionItemResultRow,
  type InspectionRow,
  inspectionItemResults,
  inspections,
  users,
} from '@/db/schema'
import { isSuspended } from '@/features/appeals/suspension'
import { loadApplicationContext } from '@/features/applications/context'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { getVersion } from '@/features/config/store'
import { listDocuments } from '@/features/documents/listDocuments'
import { mayUploadTo } from '@/features/documents/uploads'
import type { HonestValue } from '@/features/honest/honest'
import type { ChecklistBody } from '@/features/inspections/checklistSchema'
import { type ClosingCopy, closingCopy } from '@/features/inspections/closingCopy'
import { inspectionName } from '@/features/inspections/inspectorFocus'
import { inspectionTypeLabel, loadSiteInfo } from '@/features/inspections/siteInfo'
import { inspectionVisibleTo, recordsInspection } from '@/features/inspections/visibility'
import { townToday } from '@/features/town/today'
import { err, ok, type Result } from '@/types/result'

export interface InspectionViewItem {
  key: string
  label: string
  required: boolean
  outcome: 'pass' | 'fail' | 'na' | null
  note: string
}

export interface InspectionView {
  inspection: InspectionRow
  typeLabel: string
  name: string
  inspectorName: string | null
  applicationState: string
  closing: ClosingCopy | null
  today: string
  applicationNumber: string
  siteAddress: HonestValue<string>
  parcelDisplayId: string | null
  items: InspectionViewItem[]
  previousFailureNotes: string | null
  photos: { documentId: string; title: string }[]
  mayRecord: boolean
  suspended: boolean
  canRecord: boolean
  canAddPhotos: boolean
  showContactPhone: boolean
  waitingForDate: boolean
}

export async function userName(db: DbOrTx, userId: string | null): Promise<string | null> {
  if (userId === null) return null
  const [row] = await db.select({ name: users.displayName }).from(users).where(eq(users.id, userId))
  return row?.name ?? null
}

function viewItems(checklist: ChecklistBody, results: InspectionItemResultRow[]) {
  return checklist.items.map((item) => {
    const stored = results.find((r) => r.itemKey === item.key)
    return {
      key: item.key,
      label: item.label,
      required: item.required,
      outcome: stored?.outcome ?? null,
      note: stored?.note ?? '',
    }
  })
}

function recordAccess(input: {
  inspection: InspectionRow
  mayRecord: boolean
  suspended: boolean
  today: string
}) {
  const { inspection, mayRecord, suspended, today } = input
  const open = mayRecord && inspection.status === 'scheduled' && !suspended
  const dateReached = inspection.scheduledDate !== null && today >= inspection.scheduledDate
  return { canRecord: open && dateReached, waitingForDate: open && !dateReached }
}

export async function loadInspectionView(
  db: DbOrTx,
  actor: Actor,
  inspectionId: string,
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<Result<InspectionView, 'not_found'>> {
  signal.throwIfAborted()
  const [inspection] = await db
    .select()
    .from(inspections)
    .where(and(eq(inspections.id, inspectionId), inspectionVisibleTo(actor)))
  if (inspection === undefined) return err('not_found')
  const [
    site,
    version,
    results,
    previous,
    photos,
    holdsRecord,
    maySchedule,
    today,
    app,
    appealed,
    inspectorName,
  ] = await Promise.all([
    loadSiteInfo(db, inspection.applicationId, now, signal),
    getVersion(db, inspection.checklistVersionId, signal),
    db
      .select()
      .from(inspectionItemResults)
      .where(eq(inspectionItemResults.inspectionId, inspection.id)),
    inspection.reinspectionOf === null
      ? Promise.resolve(undefined)
      : db
          .select()
          .from(inspections)
          .where(eq(inspections.id, inspection.reinspectionOf))
          .then((rows) => rows[0]),
    listDocuments(
      db,
      actor,
      { record: { kind: 'inspection', id: inspection.id }, limit: 50 },
      signal,
    ),
    hasCapability(db, actor.userId, 'inspection.record', signal),
    hasCapability(db, actor.userId, 'inspection.schedule', signal),
    townToday(db, now, signal),
    loadApplicationContext(db, inspection.applicationId, signal),
    isSuspended(db, inspection.applicationId, signal),
    userName(db, inspection.inspectorUserId),
  ])
  if (site === null || version === null || app === null) return err('not_found')
  const checklist = version.body as ChecklistBody
  const mayRecord = holdsRecord && recordsInspection(actor, inspection.inspectorUserId)
  const suspended = app.state === 'suspended' || appealed
  return ok({
    inspection,
    typeLabel: inspectionTypeLabel(inspection.inspectionType),
    name: inspectionName(inspection),
    inspectorName,
    applicationState: app.state,
    closing: closingCopy(
      inspection.isFinal,
      app.typeBody.workflow.closesOn,
      site.applicationNumber,
    ),
    today,
    applicationNumber: site.applicationNumber,
    siteAddress: site.siteAddress,
    parcelDisplayId: site.parcelDisplayId,
    items: viewItems(checklist, results),
    previousFailureNotes: previous?.resultNotes ?? null,
    photos: photos.rows.map((p) => ({ documentId: p.documentId, title: p.title })),
    mayRecord,
    suspended,
    ...recordAccess({ inspection, mayRecord, suspended, today }),
    canAddPhotos: await mayUploadTo(
      db,
      actor,
      { kind: 'inspection', id: inspection.id },
      signal,
      now,
    ),
    showContactPhone: holdsRecord || maySchedule,
  })
}
