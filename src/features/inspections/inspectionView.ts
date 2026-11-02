import { and, eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { type InspectionRow, inspectionItemResults, inspections } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { getVersion } from '@/features/config/store'
import { listDocuments } from '@/features/documents/listDocuments'
import type { HonestValue } from '@/features/honest/honest'
import type { ChecklistBody } from '@/features/inspections/checklistSchema'
import { inspectionTypeLabel, loadSiteInfo } from '@/features/inspections/siteInfo'
import { inspectionVisibleTo, managesAllInspectors } from '@/features/inspections/visibility'
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
  applicationNumber: string
  siteAddress: HonestValue<string>
  parcelDisplayId: string | null
  items: InspectionViewItem[]
  previousFailureNotes: string | null
  photos: { documentId: string; title: string }[]
  canRecord: boolean
  canAddPhotos: boolean
  waitingForDate: boolean
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
  const [site, version, results, previous, photos, mayRecord, today] = await Promise.all([
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
    townToday(db, now, signal),
  ])
  if (site === null || version === null) return err('not_found')
  const checklist = version.body as ChecklistBody
  const assigned = inspection.inspectorUserId === actor.userId || managesAllInspectors(actor)
  const scheduled = inspection.status === 'scheduled'
  const dateReached = inspection.scheduledDate !== null && today >= inspection.scheduledDate
  return ok({
    inspection,
    typeLabel: inspectionTypeLabel(inspection.inspectionType),
    applicationNumber: site.applicationNumber,
    siteAddress: site.siteAddress,
    parcelDisplayId: site.parcelDisplayId,
    items: checklist.items.map((item) => {
      const stored = results.find((r) => r.itemKey === item.key)
      return {
        key: item.key,
        label: item.label,
        required: item.required,
        outcome: stored?.outcome ?? null,
        note: stored?.note ?? '',
      }
    }),
    previousFailureNotes: previous?.resultNotes ?? null,
    photos: photos.rows.map((p) => ({ documentId: p.documentId, title: p.title })),
    canRecord: mayRecord && assigned && scheduled && dateReached,
    canAddPhotos: mayRecord && assigned && scheduled,
    waitingForDate: mayRecord && assigned && scheduled && !dateReached,
  })
}
