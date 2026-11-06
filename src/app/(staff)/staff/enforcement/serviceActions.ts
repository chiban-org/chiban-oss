'use server'

import { recordAnswer } from '@/features/enforcement/answers'
import { recordCourtStep } from '@/features/enforcement/courtSteps'
import { listRecipient, recordRoleCheck } from '@/features/enforcement/service'
import { recordServiceEvent } from '@/features/enforcement/serviceEvents'
import type { ActionResult } from '@/server/actionRunner'
import { runStaffForm } from '@/server/formInput'
import { runStaffFormToday } from '@/server/formInputToday'
import { settled } from './enforcementResult'
import {
  answerForm,
  COURT_STEP_FORM,
  LIST_RECIPIENT_FORM,
  roleCheckForm,
  SERVICE_EVENT_FORM,
} from './serviceInputs'

export async function listRecipientAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, LIST_RECIPIENT_FORM, async ({ db, actor, signal }, input) =>
    settled(await listRecipient(db, actor, input, signal), 'Recipient added.'),
  )
}

export async function roleCheckAction(formData: FormData): Promise<ActionResult> {
  return await runStaffFormToday(formData, roleCheckForm, async ({ db, actor, signal }, input) =>
    settled(await recordRoleCheck(db, actor, input, signal), 'Check recorded.', {
      invalid_outcome: 'outcome',
    }),
  )
}

export async function serviceEventAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, SERVICE_EVENT_FORM, async ({ db, actor, signal }, input) => {
    const { serverName, serverRole, newspaper, ...rest } = input
    return settled(
      await recordServiceEvent(
        db,
        actor,
        {
          ...rest,
          ...(serverName === null ? {} : { serverName }),
          ...(serverRole === null ? {} : { serverRole }),
          ...(newspaper === null ? {} : { newspaper }),
        },
        signal,
        new Date(),
      ),
      'Service recorded.',
      {
        date_in_future: 'servedOn',
        recipient_not_found: 'recipientId',
        recipient_method_mismatch: 'recipientId',
        proof_required: 'proofDocumentId',
        server_role_required: 'serverRole',
        fallback_needs_owner_not_found: 'method',
      },
    )
  })
}

export async function answerAction(formData: FormData): Promise<ActionResult> {
  return await runStaffFormToday(formData, answerForm, async ({ db, actor, signal }, input) =>
    settled(await recordAnswer(db, actor, input, signal), 'Answer recorded.', {
      document_invalid: 'documentId',
    }),
  )
}

export async function courtStepAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, COURT_STEP_FORM, async ({ db, actor, signal }, input) => {
    const { docket, judgmentOutcome, ...rest } = input
    return settled(
      await recordCourtStep(
        db,
        actor,
        {
          ...rest,
          ...(docket === null ? {} : { docket }),
          ...(judgmentOutcome === null ? {} : { judgmentOutcome }),
        },
        signal,
      ),
      'Court step recorded.',
      {
        date_in_future: 'occurredOn',
        date_before_motion: 'occurredOn',
        proof_required: 'documentId',
      },
    )
  })
}
