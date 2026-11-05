import { NH_LICENSE_LOOKUP } from '@packs/nh/links'
import { and, desc, eq } from 'drizzle-orm'
import type { Db, DbOrTx, Tx } from '@/db/client'
import {
  applications,
  type LicenseResult,
  ledgerAllocations,
  ledgerEntries,
  licenseChecks,
  parcels,
  projects,
  receipts,
} from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import type { ApplicationTypeBody } from '@/features/applications/applicationTypeSchema'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { getPublished } from '@/features/config/store'
import {
  createCounterApplication,
  retryableApplication,
} from '@/features/counter/counterApplication'
import { recordCounterPayment } from '@/features/counter/counterPayment'
import { requiresTradeLicense } from '@/features/counter/directIssueTypes'
import { assessFees } from '@/features/fees/assess'
import type { FieldError } from '@/features/forms/validateSubmission'
import type { GateResult } from '@/features/gates/evaluateGates'
import { issueInTransaction } from '@/features/issuance/issueApplication'
import { feeBalance } from '@/features/ledger/feeBalance'
import type { AllocationInput } from '@/features/ledger/types'
import { displayIdsFor } from '@/features/parcels/displayId'
import { getActiveProcessor } from '@/features/payments/processorAccounts'
import type { ProcessorError } from '@/features/payments/processors/types'
import { startCardPresentPayment } from '@/features/payments/startPayment'
import { addParty } from '@/features/projects/parties'
import { createProject } from '@/features/projects/projects'
import type { ObjectStore } from '@/features/storage/objectStore'
import { err, ok, type Result } from '@/types/result'

export type { LicenseResult }

export interface QuickIssueInput {
  parcelId: string
  applicationTypeKey: string
  values: Record<string, unknown>
  contractor: { name: string; email?: string }
  license?: { number: string; type: string; result: LicenseResult; note?: string }
  payerName: string
  applicationId?: string
  payment:
    | { method: 'cash'; tenderedCents?: number }
    | { method: 'check'; checkNumber: string }
    | { method: 'card' }
}

export interface QuickIssueResult {
  applicationId: string
  number: string
  state: 'issued' | 'submitted'
  attemptId: string | null
  receiptNumber: string | null
}

export type QuickIssueError =
  | 'forbidden'
  | 'not_direct_issue_type'
  | 'license_not_active'
  | 'license_required'
  | 'tendered_short'
  | 'check_number_required'
  | 'unknown_parcel'
  | 'not_published'
  | 'config_inconsistent'
  | 'not_configured'
  | 'nothing_due'
  | 'over_allocated'
  | 'amount_mismatch'
  | 'stale_version'
  | 'invalid_transition'
  | 'fees_incomplete'
  | 'not_found'
  | 'attestation_mismatch'
  | 'agent_needs_owner_authorization'
  | { fieldErrors: FieldError[] }
  | { gateBlocked: GateResult[] }
  | ProcessorError

export interface QuickIssueDeps {
  now?: Date
  store?: ObjectStore
}

async function mayQuickIssue(db: Db, actor: Actor, signal: AbortSignal): Promise<boolean> {
  return (
    (await hasCapability(db, actor.userId, 'permit.issue', signal)) &&
    (await hasCapability(db, actor.userId, 'payment.collect', signal))
  )
}

async function receiptNumberFor(db: Db, applicationId: string): Promise<string | null> {
  const [row] = await db
    .select({ number: receipts.number })
    .from(ledgerAllocations)
    .innerJoin(ledgerEntries, eq(ledgerEntries.id, ledgerAllocations.entryId))
    .innerJoin(receipts, eq(receipts.id, ledgerEntries.receiptId))
    .where(eq(ledgerAllocations.applicationId, applicationId))
    .orderBy(desc(receipts.issuedAt))
    .limit(1)
  return row?.number ?? null
}

async function dueAllocations(
  db: DbOrTx,
  applicationId: string,
  signal: AbortSignal,
): Promise<{ totalCents: number; allocations: AllocationInput[] }> {
  const balance = await feeBalance(db, applicationId, signal)
  const due = balance.lines.filter((l) => l.dueCents > 0 && l.stage !== 'at_renewal')
  return {
    totalCents: due.reduce((sum, l) => sum + l.dueCents, 0),
    allocations: due.map((l) => ({
      targetKind: 'fee_assessment_line' as const,
      applicationId,
      feeAssessmentId: l.feeAssessmentId,
      stage: l.stage,
      feeCode: l.feeCode,
      amountCents: l.dueCents,
    })),
  }
}

async function collectPayment(
  tx: Tx,
  actor: Actor,
  target: { input: QuickIssueInput; typeBody: ApplicationTypeBody; applicationId: string },
  signal: AbortSignal,
  now: Date,
): Promise<Result<string | null, QuickIssueError>> {
  const { input, typeBody, applicationId } = target
  if (input.payment.method === 'card') return ok(null)
  if (typeBody.payTiming !== 'at_intake') {
    const assessed = await assessFees(tx, applicationId, 'at_approval', actor, signal)
    if (!assessed.ok) return err('fees_incomplete')
  }
  const due = await dueAllocations(tx, applicationId, signal)
  if (due.totalCents === 0) return ok(null)
  const paid = await recordCounterPayment(
    tx,
    actor,
    {
      method: input.payment.method,
      amountCents: due.totalCents,
      tenderedCents: input.payment.method === 'cash' ? input.payment.tenderedCents : undefined,
      checkNumber: input.payment.method === 'check' ? input.payment.checkNumber : undefined,
      payerName: input.payerName,
      allocations: due.allocations,
    },
    signal,
    now,
  )
  return paid.ok ? ok(paid.value.receiptNumber) : err(paid.error)
}

export async function quickIssue(
  db: Db,
  actor: Actor,
  input: QuickIssueInput,
  signal: AbortSignal,
  deps: QuickIssueDeps = {},
): Promise<Result<QuickIssueResult, QuickIssueError>> {
  signal.throwIfAborted()
  const now = deps.now ?? new Date()
  if (!(await mayQuickIssue(db, actor, signal))) return err('forbidden')
  const type = await getPublished(db, 'application_type', input.applicationTypeKey, signal)
  if (type === null) return err('not_published')
  const typeBody = type.body as ApplicationTypeBody
  if (input.license === undefined && requiresTradeLicense(typeBody)) return err('license_required')
  if (input.license !== undefined && input.license.result !== 'active') {
    return err('license_not_active')
  }
  if (!typeBody.workflow.allowsDirectIssue) return err('not_direct_issue_type')
  if (input.payment.method === 'card' && (await getActiveProcessor(db, signal)).state !== 'known') {
    return err('not_configured')
  }
  const created = await transactionResult<QuickIssueResult, QuickIssueError>(db, async (tx) => {
    const target =
      input.applicationId === undefined
        ? await createCounterApplication(tx, actor, { input, typeBody }, signal, now)
        : await retryableApplication(tx, input, input.applicationId)
    if (!target.ok) return err(target.error)
    const { applicationId } = target.value
    const base = { applicationId, number: target.value.number, attemptId: null }
    if (input.payment.method === 'card') {
      return ok({ ...base, state: 'submitted' as const, receiptNumber: null })
    }
    const collected = await collectPayment(
      tx,
      actor,
      { input, typeBody, applicationId },
      signal,
      now,
    )
    if (!collected.ok) return err(collected.error)
    const receiptNumber = collected.value
    const issued = await issueInTransaction(tx, actor, { applicationId }, signal, {
      now,
      ...(deps.store === undefined ? {} : { store: deps.store }),
    })
    if (!issued.ok) return err(issued.error)
    return ok({ ...base, state: 'issued' as const, receiptNumber })
  })
  if (!created.ok || input.payment.method !== 'card') return created
  const started = await startCardPresentPayment(
    db,
    actor,
    { applicationIds: [created.value.applicationId], payerName: input.payerName },
    signal,
    { now },
  )
  if (!started.ok) return err(started.error)
  return ok({ ...created.value, attemptId: started.value.attemptId })
}

export async function completeQuickIssue(
  db: Db,
  actor: Actor,
  input: { applicationId: string; expectedRowVersion: number },
  signal: AbortSignal,
  deps: QuickIssueDeps = {},
): Promise<Result<QuickIssueResult, QuickIssueError>> {
  signal.throwIfAborted()
  if (!(await mayQuickIssue(db, actor, signal))) return err('forbidden')
  const moved = await transactionResult(db, (tx) =>
    issueInTransaction(
      tx,
      actor,
      { applicationId: input.applicationId, expectedRowVersion: input.expectedRowVersion },
      signal,
      {
        ...(deps.now === undefined ? {} : { now: deps.now }),
        ...(deps.store === undefined ? {} : { store: deps.store }),
      },
    ),
  )
  if (!moved.ok) return err(moved.error)
  const [row] = await db.select().from(applications).where(eq(applications.id, input.applicationId))
  return ok({
    applicationId: input.applicationId,
    number: row?.number ?? '',
    state: row?.state === 'issued' ? 'issued' : 'submitted',
    attemptId: null,
    receiptNumber: await receiptNumberFor(db, input.applicationId),
  })
}
