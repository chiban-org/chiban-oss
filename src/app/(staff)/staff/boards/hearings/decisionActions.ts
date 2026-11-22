'use server'

import { addAppealNode } from '@/features/appeals/graph'
import { generateDecisionDocuments } from '@/features/decisions/decisionDocuments'
import { recordDecisionDelivery } from '@/features/decisions/delivery'
import { fileDecision } from '@/features/decisions/fileDecision'
import { recordDecision } from '@/features/decisions/recordDecision'
import { recordDecisionRecording, recordFinalWrittenApproval } from '@/features/decisions/recording'
import { recordRegionalTransmittal } from '@/features/decisions/regionalTransmittal'
import { getObjectStore } from '@/features/storage/objectStore'
import type { ActionResult } from '@/server/actionRunner'
import { runStaffForm } from '@/server/formInput'
import { errorOrField } from '../formFields'
import {
  ADD_APPEAL_NODE_FORM,
  DECISION_ONLY_FORM,
  FILE_DECISION_FORM,
  RECORD_DECISION_FORM,
  RECORD_DECISION_NO_HEARING_FORM,
  RECORD_DELIVERY_FORM,
  RECORD_FINAL_APPROVAL_FORM,
  RECORD_REGISTRY_FORM,
} from './forms'

export async function recordDecisionAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(
    formData,
    RECORD_DECISION_FORM,
    async ({ db, actor, signal }, input) => {
      const { reasons, ...rest } = input
      const recorded = await recordDecision(
        db,
        actor,
        { ...rest, reasonsForDisapproval: reasons ?? '' },
        signal,
      )
      return errorOrField(recorded, 'Decision recorded. The filing deadline has started.', {
        future_date: 'votedOn',
        already_final: 'finalMunicipalApproval',
      })
    },
  )
}

export async function recordDecisionWithoutHearingAction(
  formData: FormData,
): Promise<ActionResult> {
  return await runStaffForm(
    formData,
    RECORD_DECISION_NO_HEARING_FORM,
    async ({ db, actor, signal }, input) => {
      const { reasons, ...rest } = input
      const recorded = await recordDecision(
        db,
        actor,
        { ...rest, hearingId: null, reasonsForDisapproval: reasons ?? '' },
        signal,
      )
      return errorOrField(recorded, 'Decision recorded. The filing deadline has started.', {
        future_date: 'votedOn',
        before_meeting: 'votedOn',
        before_receipt: 'votedOn',
        before_acceptance: 'votedOn',
        not_found: 'meetingId',
        already_final: 'finalMunicipalApproval',
      })
    },
  )
}

export async function generateDecisionDocumentsAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, DECISION_ONLY_FORM, async ({ db, actor, signal }, input) =>
    errorOrField(
      await generateDecisionDocuments(db, getObjectStore(), actor, input.decisionId, signal),
      'Notice of Decision and decision letter created.',
    ),
  )
}

export async function fileDecisionAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, FILE_DECISION_FORM, async ({ db, actor, signal }, input) => {
    const filed = await fileDecision(db, actor, input, signal)
    if (!filed.ok) {
      return errorOrField(filed, '', {
        future_date: 'filedOn',
        before_vote: 'filedOn',
        document_not_found: 'minutesDocumentId',
        wrong_document: 'minutesDocumentId',
      })
    }
    return {
      ok: true,
      message: filed.value.late
        ? 'Decision filed late. A 30 day amendment window now runs from today.'
        : 'Decision and minutes filed and shown on the public site.',
    }
  })
}

export async function transmittalAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, DECISION_ONLY_FORM, async ({ db, actor, signal }, input) => {
    const result = await recordRegionalTransmittal(db, actor, input.decisionId, signal)
    if (!result.ok) return errorOrField(result, '')
    return {
      ok: true,
      message: result.value.met
        ? 'Every recipient has timely proof. The transmittal deadline is met.'
        : 'Transmittal checklist is ready. Record proof for each recipient.',
    }
  })
}

export async function recordDeliveryAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, RECORD_DELIVERY_FORM, async ({ db, actor, signal }, input) =>
    errorOrField(await recordDecisionDelivery(db, actor, input, signal), 'Delivery recorded.', {
      future_date: 'deliveredOn',
      before_vote: 'deliveredOn',
      method_not_allowed: 'method',
    }),
  )
}

export async function recordFinalApprovalAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(
    formData,
    RECORD_FINAL_APPROVAL_FORM,
    async ({ db, actor, signal }, input) =>
      errorOrField(
        await recordFinalWrittenApproval(db, actor, input, signal),
        'Final written approval recorded. The recording period has started.',
        { future_date: 'approvedOn', before_vote: 'approvedOn' },
      ),
  )
}

export async function recordRegistryAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, RECORD_REGISTRY_FORM, async ({ db, actor, signal }, input) =>
    errorOrField(await recordDecisionRecording(db, actor, input, signal), 'Recording saved.', {
      future_date: 'recordedOn',
      before_approval: 'recordedOn',
      after_period: 'recordedOn',
      document_not_found: 'certificateDocumentId',
    }),
  )
}

export async function addAppealNodeAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(
    formData,
    ADD_APPEAL_NODE_FORM,
    async ({ db, actor, signal }, input) => {
      const { outcome, linked, appellantName, ...rest } = input
      const added = await addAppealNode(
        db,
        actor,
        {
          ...rest,
          ...(outcome === '' ? {} : { outcome }),
          ...(appellantName === null ? {} : { appellantName }),
          linkedComponent: linked === 'yes',
        },
        signal,
      )
      return errorOrField(added, 'Recorded on the appeal graph.', {
        future_date: 'occurredOn',
        before_parent: 'occurredOn',
        duplicate_step: 'kind',
        route_not_allowed: 'kind',
        not_final: 'kind',
        before_reinstatement: 'occurredOn',
        filed_during_hold: 'occurredOn',
        already_final: 'finalMunicipalApproval',
        wrong_outcome: 'outcome',
      })
    },
  )
}
