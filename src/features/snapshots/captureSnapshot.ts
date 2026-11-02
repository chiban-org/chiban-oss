import { and, eq, isNull, sql } from 'drizzle-orm'
import { AppError, ErrorIds } from '@/constants/errorIds'
import type { Tx } from '@/db/client'
import {
  applicationSnapshots,
  attestations,
  documents,
  documentVersions,
  projectParties,
} from '@/db/schema'
import { loadApplicationContext } from '@/features/applications/context'
import type { Actor } from '@/features/auth/actor'
import { getVersion } from '@/features/config/store'
import { attachDocument } from '@/features/documents/attach'
import { sha256Hex, storeGeneratedBytes } from '@/features/files/ingest'
import type { FormBody } from '@/features/forms/formSchema'
import { canonicalJson } from '@/features/snapshots/canonicalJson'
import {
  type ApplicationSnapshotBody,
  publicSnapshotView,
  type SnapshotParty,
} from '@/features/snapshots/publicView'
import { renderSnapshotPdf } from '@/features/snapshots/snapshotPdf'
import { getObjectStore, type ObjectStore } from '@/features/storage/objectStore'
import { getTownSettings } from '@/features/town/settings'

export type SnapshotReason = 'submission' | 'amendment'

async function partiesOf(tx: Tx, projectId: string): Promise<SnapshotParty[]> {
  return await tx
    .select({ role: projectParties.role, name: projectParties.name, email: projectParties.email })
    .from(projectParties)
    .where(and(eq(projectParties.projectId, projectId), isNull(projectParties.removedAt)))
}

async function attachmentsOf(tx: Tx, applicationId: string) {
  return await tx
    .select({
      documentId: documents.id,
      versionId: documentVersions.id,
      sha256: documentVersions.fileSha256,
      filename: documentVersions.filename,
    })
    .from(documents)
    .innerJoin(documentVersions, eq(documentVersions.documentId, documents.id))
    .where(
      and(
        eq(documents.recordKind, 'application'),
        eq(documents.recordId, applicationId),
        eq(documents.docKind, 'attachment'),
        eq(documentVersions.role, 'original'),
      ),
    )
    .orderBy(documents.seq)
}

function submittedValues(form: FormBody, values: Record<string, unknown>) {
  const staffOnly = new Set(form.fields.filter((f) => f.staffOnly === true).map((f) => f.key))
  return Object.fromEntries(Object.entries(values).filter(([k]) => !staffOnly.has(k)))
}

export async function captureSnapshot(
  tx: Tx,
  applicationId: string,
  reason: SnapshotReason,
  actor: Actor,
  signal: AbortSignal,
  store: ObjectStore = getObjectStore(),
  now: Date = new Date(),
): Promise<{ snapshotId: string; documentId: string }> {
  signal.throwIfAborted()
  const app = await loadApplicationContext(tx, applicationId, signal)
  if (app === null) throw new AppError(ErrorIds.DB_INVARIANT, 'snapshot of a missing application')
  const form = (await getVersion(tx, app.pins.form, signal))?.body as FormBody
  const [attested] = await tx
    .select()
    .from(attestations)
    .where(eq(attestations.applicationId, applicationId))
    .orderBy(attestations.attestedAt)
    .limit(1)
  const body: ApplicationSnapshotBody = {
    applicationNumber: app.number,
    applicationTypeKey: app.typeBody.key,
    configPins: app.pins,
    form,
    values: submittedValues(form, app.values) as ApplicationSnapshotBody['values'],
    facts: app.facts,
    parties: await partiesOf(tx, app.projectId),
    attestation:
      attested === undefined
        ? null
        : {
            userId: attested.userId,
            statementSha256: attested.statementSha256,
            attestedAt: attested.attestedAt.toISOString(),
          },
    attachments: await attachmentsOf(tx, applicationId),
    receivedDate: app.receivedDate,
    capturedAt: now.toISOString(),
  }
  const [seq] = await tx
    .select({ next: sql<number>`coalesce(max(${applicationSnapshots.sequence}), 0) + 1` })
    .from(applicationSnapshots)
    .where(eq(applicationSnapshots.applicationId, applicationId))
  const sequence = seq?.next ?? 1
  const [snapshot] = await tx
    .insert(applicationSnapshots)
    .values({
      applicationId,
      sequence,
      reason,
      body,
      bodySha256: sha256Hex(new TextEncoder().encode(canonicalJson(body))),
      createdBy: actor.userId,
    })
    .returning({ id: applicationSnapshots.id })
  const town = await getTownSettings(tx, signal)
  const townName = town.ok ? town.value.name : ''
  const full = await renderSnapshotPdf(body, townName, sequence)
  const redacted = await renderSnapshotPdf(
    { ...publicSnapshotView(body), attestation: null },
    townName,
    sequence,
  )
  const original = await storeGeneratedBytes(tx, store, full, 'application/pdf', signal)
  const publicCopy = await storeGeneratedBytes(tx, store, redacted, 'application/pdf', signal)
  const filename = `${app.number}-snapshot-${sequence}.pdf`
  const attached = await attachDocument(
    tx,
    actor,
    {
      target: { kind: 'application', id: applicationId },
      title: `Application ${app.number}, snapshot ${sequence}`,
      docKind: 'application_snapshot',
      file: { sha256: original.sha256, filename, contentType: 'application/pdf' },
      audiences: ['project_parties', 'reviewers'],
      isPublic: false,
    },
    signal,
  )
  await tx.insert(documentVersions).values({
    documentId: attached.documentId,
    role: 'public_redacted',
    fileSha256: publicCopy.sha256,
    filename: `${app.number}-snapshot-${sequence}-public.pdf`,
    contentType: 'application/pdf',
    createdBy: actor.userId,
  })
  return { snapshotId: snapshot?.id ?? '', documentId: attached.documentId }
}
