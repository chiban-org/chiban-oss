import { and, desc, eq, inArray } from 'drizzle-orm'
import type { Db, Tx } from '@/db/client'
import { applications, certificatesOfOccupancy, inspections, users } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { isSuspended } from '@/features/appeals/suspension'
import { loadApplicationContext } from '@/features/applications/context'
import { nextNumber } from '@/features/applications/createApplication'
import { transitionApplication } from '@/features/applications/transition'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { buildCertificatePdf } from '@/features/certificates/certificatePdf'
import { attachDocument } from '@/features/documents/attach'
import { storeGeneratedBytes } from '@/features/files/ingest'
import type { GateResult } from '@/features/gates/evaluateGates'
import type { ObjectStore } from '@/features/storage/objectStore'
import { townToday } from '@/features/town/today'
import { type CivilDate, civilYear } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

const CERTIFICATE_PREFIX = 'CO'

export interface IssueCertificateInput {
  applicationId: string
  issuedOn: CivilDate
  expectedRowVersion: number
}

export type IssueCertificateError =
  | 'not_found'
  | 'forbidden'
  | 'not_a_co_type'
  | 'permit_suspended'
  | 'not_issued'
  | 'final_not_passed'
  | 'future_date'
  | 'stale_version'
  | { gateBlocked: GateResult[] }

interface Checked {
  finalInspectionId: string
  finalOn: CivilDate
  inspectorId: string | null
}

async function latestDecidedFinal(tx: Tx, applicationId: string) {
  const [row] = await tx
    .select()
    .from(inspections)
    .where(
      and(
        eq(inspections.applicationId, applicationId),
        eq(inspections.isFinal, true),
        inArray(inspections.status, ['passed', 'failed']),
      ),
    )
    .orderBy(desc(inspections.resultRecordedAt), desc(inspections.updatedAt))
    .limit(1)
  return row ?? null
}

async function check(
  tx: Tx,
  input: IssueCertificateInput,
  today: CivilDate,
  signal: AbortSignal,
): Promise<Result<Checked, IssueCertificateError>> {
  await tx
    .select({ id: applications.id })
    .from(applications)
    .where(eq(applications.id, input.applicationId))
    .for('update')
  const app = await loadApplicationContext(tx, input.applicationId, signal)
  if (app === null) return err('not_found')
  if (app.typeBody.workflow.closesOn !== 'certificate_of_occupancy') return err('not_a_co_type')
  if (app.state === 'suspended' || (await isSuspended(tx, app.id, signal))) {
    return err('permit_suspended')
  }
  if (app.state !== 'issued') return err('not_issued')
  if (app.rowVersion !== input.expectedRowVersion) return err('stale_version')
  const final = await latestDecidedFinal(tx, app.id)
  if (final?.status !== 'passed') return err('final_not_passed')
  if (input.issuedOn > today) return err('future_date')
  const finalOn = (final.scheduledDate ?? input.issuedOn) as CivilDate
  return ok({ finalInspectionId: final.id, finalOn, inspectorId: final.resultRecordedBy })
}

async function issueInTransaction(
  tx: Tx,
  store: ObjectStore,
  actor: Actor,
  input: IssueCertificateInput,
  today: CivilDate,
  signal: AbortSignal,
): Promise<
  Result<{ certificateId: string; number: string; documentId: string }, IssueCertificateError>
> {
  const checked = await check(tx, input, today, signal)
  if (!checked.ok) return checked
  const closed = await transitionApplication(
    tx,
    actor,
    {
      applicationId: input.applicationId,
      to: 'closed',
      closureReason: 'certificate_of_occupancy',
      expectedRowVersion: input.expectedRowVersion,
      onDate: input.issuedOn,
    },
    signal,
  )
  if (!closed.ok) {
    if (typeof closed.error === 'object') return err(closed.error)
    return err(closed.error === 'stale_version' ? 'stale_version' : 'forbidden')
  }
  const number = await nextNumber(tx, CERTIFICATE_PREFIX, civilYear(input.issuedOn))
  const [inspector] = await tx
    .select({ name: users.displayName })
    .from(users)
    .where(eq(users.id, checked.value.inspectorId ?? ''))
  const bytes = await buildCertificatePdf(
    tx,
    input.applicationId,
    {
      number,
      issuedOn: input.issuedOn,
      finalInspectionOn: checked.value.finalOn,
      inspectorName: inspector?.name ?? 'Inspector',
    },
    signal,
  )
  if (bytes === null) return err('not_found')
  const stored = await storeGeneratedBytes(tx, store, bytes, 'application/pdf', signal)
  const attached = await attachDocument(
    tx,
    actor,
    {
      target: { kind: 'application', id: input.applicationId },
      title: `Certificate of Occupancy ${number}`,
      docKind: 'certificate_of_occupancy',
      audiences: ['project_parties'],
      isPublic: false,
      file: { sha256: stored.sha256, filename: `${number}.pdf`, contentType: 'application/pdf' },
    },
    signal,
  )
  const [cert] = await tx
    .insert(certificatesOfOccupancy)
    .values({
      applicationId: input.applicationId,
      number,
      issuedOn: input.issuedOn,
      finalInspectionId: checked.value.finalInspectionId,
      documentId: attached.documentId,
      issuedBy: actor.userId,
    })
    .returning({ id: certificatesOfOccupancy.id })
  const certificateId = cert?.id ?? ''
  await writeAudit(
    tx,
    {
      actor: { kind: 'user', userId: actor.userId },
      action: 'certificate.issue',
      entityType: 'application',
      entityId: input.applicationId,
      after: { number, issuedOn: input.issuedOn },
    },
    signal,
  )
  return ok({ certificateId, number, documentId: attached.documentId })
}

export async function issueCertificateOfOccupancy(
  db: Db,
  store: ObjectStore,
  actor: Actor,
  input: IssueCertificateInput,
  signal: AbortSignal,
  deps: { now?: Date } = {},
): Promise<
  Result<{ certificateId: string; number: string; documentId: string }, IssueCertificateError>
> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'permit.issue', signal)
  if (!allowed.ok) return err('forbidden')
  const today = await townToday(db, deps.now ?? new Date(), signal)
  return await transactionResult(db, (tx) =>
    issueInTransaction(tx, store, actor, input, today, signal),
  )
}
