import { and, eq } from 'drizzle-orm'
import type { Db, Tx } from '@/db/client'
import { appealNodes, applications } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { addAdministrativeDecisionTx } from '@/features/appeals/adminAppeals'
import { loadApplicationContext } from '@/features/applications/context'
import {
  type TransitionError,
  type TransitionOutcome,
  transitionApplication,
} from '@/features/applications/transition'
import type { Actor } from '@/features/auth/actor'
import { boardOfApplication } from '@/features/boards/boardOf'
import { appealRightsForDecision } from '@/features/decisions/appealRights'
import { attachDocument } from '@/features/documents/attach'
import { storeGeneratedBytes } from '@/features/files/ingest'
import type { DecisionOutcome } from '@/features/packs/schema'
import { documentFrame } from '@/features/pdf/documentFrame'
import { loadPermitData, mergeContextOf, NOT_APPLICABLE } from '@/features/permits/permitData'
import { plumbingSignerOverride } from '@/features/permits/plumbingSigner'
import type { ObjectStore } from '@/features/storage/objectStore'
import { townTemplate } from '@/features/templates/findTemplate'
import { documentKind } from '@/features/templates/kinds/documentKinds'
import { renderDocumentOrDefault } from '@/features/templates/templateBlocks'
import { formatCivilDate } from '@/lib/formatDate'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export const MIN_DENIAL_REASON = 10

export type StaffDecisionError = 'reason_required' | 'not_found'

export interface StaffDecisionInput {
  applicationId: string
  outcome: 'decided' | 'denied'
  reason: string | null
  decidedOn: CivilDate
}

export const STAFF_DECISION_LETTER_TITLE = documentKind('permit_decision_letter').title

function recordedOutcome(denied: boolean, conditions: readonly string[]): DecisionOutcome {
  if (denied) return 'denied'
  return conditions.length > 0 ? 'approved_with_conditions' : 'approved'
}

export async function recordStaffDecisionTx(
  tx: Tx,
  actor: Actor,
  input: StaffDecisionInput,
  store: ObjectStore,
  signal: AbortSignal,
): Promise<Result<{ letterId: string; nodeId: string }, StaffDecisionError>> {
  signal.throwIfAborted()
  const denied = input.outcome === 'denied'
  const reason = input.reason?.trim() ?? ''
  if (denied && reason.length < MIN_DENIAL_REASON) return err('reason_required')
  const data = await loadPermitData(tx, input.applicationId, signal)
  if (data === null) return err('not_found')
  await tx
    .update(applications)
    .set({ decisionReason: reason === '' ? null : reason })
    .where(eq(applications.id, input.applicationId))
  const outcome = recordedOutcome(denied, data.conditions)
  const appealRights = await appealRightsForDecision(
    tx,
    data.application.typeBody.classification ?? '',
    { kind: 'administrative_decision', outcome, significant: null },
    signal,
  )
  const values = {
    ...mergeContextOf(data),
    'decision.outcome': denied ? 'Denied' : 'Approved',
    'decision.votedOn': formatCivilDate(input.decidedOn),
    'decision.reasons': reason === '' ? NOT_APPLICABLE : reason,
    'decision.reasonsSection': reason === '' ? '' : `Reason for the denial: ${reason}`,
    'decision.appealRights': appealRights,
  }
  const template = await townTemplate(
    tx,
    'permit_decision_letter',
    data.application.pins.templates,
    signal,
  )
  const frame = await documentFrame(tx, {}, signal)
  const pdf = await renderDocumentOrDefault('permit_decision_letter', template, {
    title: STAFF_DECISION_LETTER_TITLE,
    subtitle: data.application.number,
    frame,
    context: {
      values,
      conditions: data.conditions,
      locked: new Map([['decision.appealRights', appealRights]]),
      ...plumbingSignerOverride(
        'permit_decision_letter',
        data.application.typeBody.classification,
        frame,
      ),
    },
  })
  const stored = await storeGeneratedBytes(tx, store, pdf, 'application/pdf', signal)
  const attached = await attachDocument(
    tx,
    actor,
    {
      target: { kind: 'application', id: input.applicationId },
      title: STAFF_DECISION_LETTER_TITLE,
      docKind: 'attachment',
      file: {
        sha256: stored.sha256,
        filename: `${data.application.number}-decision.pdf`,
        contentType: 'application/pdf',
      },
      audiences: ['project_parties'],
      isPublic: false,
    },
    signal,
  )
  const { nodeId } = await addAdministrativeDecisionTx(
    tx,
    {
      applicationId: input.applicationId,
      occurredOn: input.decidedOn,
      createdBy: actor.userId,
      outcome,
    },
    signal,
  )
  return ok({ letterId: attached.documentId, nodeId })
}

export async function decideStaffApplication(
  db: Db,
  actor: Actor,
  input: StaffDecisionInput & { expectedRowVersion: number },
  store: ObjectStore,
  signal: AbortSignal,
): Promise<Result<TransitionOutcome, TransitionError | StaffDecisionError>> {
  return await transactionResult<TransitionOutcome, TransitionError | StaffDecisionError>(
    db,
    async (tx) => {
      const moved = await transitionApplication(
        tx,
        actor,
        {
          applicationId: input.applicationId,
          to: input.outcome,
          expectedRowVersion: input.expectedRowVersion,
        },
        signal,
      )
      if (!moved.ok) return moved
      const decided = await recordStaffDecisionTx(tx, actor, input, store, signal)
      return decided.ok ? moved : decided
    },
  )
}

async function onRegister(tx: Tx, applicationId: string): Promise<boolean> {
  const [node] = await tx
    .select({ id: appealNodes.id })
    .from(appealNodes)
    .where(
      and(
        eq(appealNodes.applicationId, applicationId),
        eq(appealNodes.kind, 'administrative_decision'),
      ),
    )
    .limit(1)
  return node !== undefined
}

export async function recordIssuedDecisionTx(
  tx: Tx,
  actor: Actor,
  applicationId: string,
  signal: AbortSignal,
): Promise<void> {
  const app = await loadApplicationContext(tx, applicationId, signal)
  if (app === null || app.issuedOn === null || boardOfApplication(app) !== null) return
  if (await onRegister(tx, applicationId)) return
  const data = await loadPermitData(tx, applicationId, signal)
  await addAdministrativeDecisionTx(
    tx,
    {
      applicationId,
      occurredOn: app.decidedOn ?? app.issuedOn,
      createdBy: actor.userId,
      outcome: recordedOutcome(false, data?.conditions ?? []),
    },
    signal,
  )
}
