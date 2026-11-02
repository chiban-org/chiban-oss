import { eq } from 'drizzle-orm'
import type { Tx } from '@/db/client'
import {
  applications,
  documents,
  documentVersions,
  enforcementCases,
  inspections,
  projects,
} from '@/db/schema'
import { loadApplicationContext } from '@/features/applications/context'
import { writeAudit } from '@/features/audit/writeAudit'
import {
  AUDIENCES,
  type Audience,
  type DocKind,
  type DocumentActor,
  isUserActor,
  type RecordRef,
} from '@/features/documents/types'
import { linkRecordToParcel } from '@/features/parcels/recordLinks'
import { createPreservationRecord } from '@/features/preservation/preserve'
import { assignSeries } from '@/features/records/assignments'
import { defaultSeriesKey, requireSeries } from '@/features/records/series'
import { insertSystemApproval } from '@/features/renditions/approvals'

export interface AttachInput {
  target: RecordRef
  title: string
  docKind: DocKind
  file: { sha256: string; filename: string; contentType: string }
  audiences?: Audience[]
  isPublic?: boolean
  seriesKey?: string
}

export function defaultsFor(kind: RecordRef['kind']): { audiences: Audience[]; isPublic: boolean } {
  if (kind === 'parcel') return { audiences: [...AUDIENCES], isPublic: false }
  if (kind === 'inspection') return { audiences: ['project_parties'], isPublic: false }
  if (kind === 'meeting') return { audiences: ['board'], isPublic: false }
  if (kind === 'enforcement_case' || kind === 'rtk_request')
    return { audiences: [], isPublic: false }
  return { audiences: ['project_parties', 'reviewers'], isPublic: false }
}

export async function applicationOf(tx: Tx, target: RecordRef): Promise<string | null> {
  if (target.kind === 'application') return target.id
  if (target.kind !== 'inspection') return null
  const [row] = await tx
    .select({ applicationId: inspections.applicationId })
    .from(inspections)
    .where(eq(inspections.id, target.id))
  return row?.applicationId ?? null
}

export async function parcelOf(tx: Tx, target: RecordRef): Promise<string | null> {
  if (target.kind === 'parcel') return target.id
  if (target.kind === 'rtk_request') return null
  if (target.kind === 'enforcement_case') {
    const [row] = await tx
      .select({ parcelId: enforcementCases.parcelId })
      .from(enforcementCases)
      .where(eq(enforcementCases.id, target.id))
    return row?.parcelId ?? null
  }
  if (target.kind === 'project') {
    const [row] = await tx
      .select({ parcelId: projects.parcelId })
      .from(projects)
      .where(eq(projects.id, target.id))
    return row?.parcelId ?? null
  }
  const applicationId = await applicationOf(tx, target)
  if (applicationId === null) return null
  const [row] = await tx
    .select({ parcelId: projects.parcelId })
    .from(applications)
    .innerJoin(projects, eq(projects.id, applications.projectId))
    .where(eq(applications.id, applicationId))
  return row?.parcelId ?? null
}

function auditActor(actor: DocumentActor) {
  if (actor.kind === 'system') return { kind: 'system', job: actor.job } as const
  if (!isUserActor(actor)) return { kind: 'anonymous_public_intake' } as const
  return { kind: 'user', userId: actor.userId } as const
}

function createdByKind(actor: DocumentActor): 'user' | 'system' | 'anonymous_public_intake' {
  if (actor.kind === 'system') return 'system'
  return isUserActor(actor) ? 'user' : 'anonymous_public_intake'
}

function createdById(actor: DocumentActor): string | null {
  return isUserActor(actor) ? actor.userId : null
}

export async function attachDocument(
  tx: Tx,
  actor: DocumentActor,
  input: AttachInput,
  signal: AbortSignal,
): Promise<{ documentId: string; versionId: string }> {
  signal.throwIfAborted()
  const defaults = defaultsFor(input.target.kind)
  const [doc] = await tx
    .insert(documents)
    .values({
      recordKind: input.target.kind,
      recordId: input.target.id,
      title: input.title,
      docKind: input.docKind,
      audiences: input.audiences ?? defaults.audiences,
      isPublic: input.isPublic ?? defaults.isPublic,
      createdByKind: createdByKind(actor),
      createdBy: createdById(actor),
    })
    .returning({ id: documents.id })
  const documentId = doc?.id ?? ''
  const [version] = await tx
    .insert(documentVersions)
    .values({
      documentId,
      role: 'original',
      fileSha256: input.file.sha256,
      filename: input.file.filename,
      contentType: input.file.contentType,
      createdBy: createdById(actor),
    })
    .returning({ id: documentVersions.id })
  if (input.isPublic ?? defaults.isPublic) {
    await insertSystemApproval(tx, {
      documentId,
      versionId: version?.id ?? '',
      statement:
        'Published when the file was attached, at the choice of the staff member who added it.',
    })
  }
  const parcelId = await parcelOf(tx, input.target)
  if (parcelId !== null) {
    await linkRecordToParcel(tx, { recordKind: 'document', recordId: documentId, parcelId }, signal)
  }
  const seriesKey = await assignInitialSeries(tx, actor, documentId, input, signal)
  await createPreservationRecord(
    tx,
    version?.id ?? '',
    seriesKey !== null && requireSeries(seriesKey).preservation === 'pdfa',
  )
  await writeAudit(
    tx,
    {
      actor: auditActor(actor),
      action: 'document.attach',
      entityType: input.target.kind,
      entityId: input.target.id,
      after: { documentId, docKind: input.docKind, sha256: input.file.sha256 },
    },
    signal,
  )
  return { documentId, versionId: version?.id ?? '' }
}

export async function defaultSeriesForApplication(
  tx: Tx,
  applicationId: string,
  signal: AbortSignal,
): Promise<string | null> {
  const app = await loadApplicationContext(tx, applicationId, signal)
  const classification = app?.typeBody.classification
  if (app === null || classification === undefined) return null
  return defaultSeriesKey(classification, app.typeBody.key)
}

const ENFORCEMENT_SERIES: Partial<Record<DocKind, string>> = {
  enforcement_photo: 'nh.rs.complaint_log',
  enforcement_letter: 'nh.rs.code_enforcement_specifications',
  service_proof: 'nh.rs.code_enforcement_specifications',
  court_document: 'nh.rs.code_enforcement_specifications',
}

async function assignInitialSeries(
  tx: Tx,
  actor: DocumentActor,
  documentId: string,
  input: AttachInput,
  signal: AbortSignal,
): Promise<string | null> {
  const ref = { kind: 'document', id: documentId } as const
  if (input.seriesKey !== undefined) {
    await assignSeries(tx, ref, input.seriesKey, 'staff', actor, signal)
    return input.seriesKey
  }
  if (input.target.kind === 'enforcement_case') {
    const key = ENFORCEMENT_SERIES[input.docKind] ?? null
    if (key !== null) await assignSeries(tx, ref, key, 'default', actor, signal)
    return key
  }
  const applicationId = await applicationOf(tx, input.target)
  if (applicationId === null) return null
  const key = await defaultSeriesForApplication(tx, applicationId, signal)
  if (key !== null) await assignSeries(tx, ref, key, 'default', actor, signal)
  return key
}
