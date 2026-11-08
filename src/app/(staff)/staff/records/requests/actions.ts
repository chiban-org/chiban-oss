'use server'

import { getMailTransport } from '@/features/mail/transport'
import { denyRequest } from '@/features/rtk/denial'
import { createRelease } from '@/features/rtk/releases'
import { closeRequest, logRequest } from '@/features/rtk/requests'
import { recordFirstResponse } from '@/features/rtk/responses'
import { recordWithholding } from '@/features/rtk/withholdings'
import { getObjectStore } from '@/features/storage/objectStore'
import type { ActionResult } from '@/server/actionRunner'
import { runStaffForm } from '@/server/formInput'
import { runStaffFormToday } from '@/server/formInputToday'
import { recordsOutcome } from '@/server/recordsAction'
import {
  closeRequestForm,
  denyRequestForm,
  firstResponseForm,
  logRequestForm,
  releaseForm,
  withholdingForm,
} from './requestForms'

export async function logRequestAction(formData: FormData): Promise<ActionResult> {
  return await runStaffFormToday(formData, logRequestForm, async ({ db, actor, signal }, input) =>
    recordsOutcome(
      await logRequest(
        db,
        actor,
        {
          receivedOn: input.receivedOn,
          receivedVia: input.receivedVia,
          description: input.description,
          ...(input.requesterName === null ? {} : { requesterName: input.requesterName }),
          ...(input.requesterContact === null ? {} : { requesterContact: input.requesterContact }),
        },
        signal,
      ),
      'Request logged.',
      { future_date: 'receivedOn' },
    ),
  )
}

export async function firstResponseAction(formData: FormData): Promise<ActionResult> {
  return await runStaffFormToday(
    formData,
    firstResponseForm,
    async ({ db, actor, signal }, input) =>
      recordsOutcome(
        await recordFirstResponse(
          db,
          getObjectStore(),
          actor,
          {
            requestId: input.requestId,
            kind: input.kind,
            respondedOn: input.respondedOn,
            ...(input.websiteUrl === null ? {} : { websiteUrl: input.websiteUrl }),
            ...(input.statedDate === null || input.delayReason === null
              ? {}
              : {
                  timeStatement: {
                    statedDate: input.statedDate,
                    delayReason: input.delayReason,
                    costEstimate:
                      input.costLabel === null || input.costDollars === null
                        ? []
                        : [{ label: input.costLabel, cents: input.costDollars }],
                  },
                }),
          },
          signal,
        ),
        'Response recorded and the letter filed.',
        {
          future_date: 'respondedOn',
          before_received: 'respondedOn',
          website_url_required: 'websiteUrl',
          stated_date_required: 'statedDate',
        },
      ),
  )
}

export async function denyRequestAction(formData: FormData): Promise<ActionResult> {
  return await runStaffFormToday(formData, denyRequestForm, async ({ db, actor, signal }, input) =>
    recordsOutcome(
      await denyRequest(
        { db, store: getObjectStore(), actor, signal },
        { requestId: input.requestId, deniedOn: input.deniedOn },
      ),
      'Denial recorded and the letter filed.',
      { future_date: 'deniedOn', before_statement: 'deniedOn' },
    ),
  )
}

export async function withholdingAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, withholdingForm, async ({ db, actor, signal }, input) =>
    recordsOutcome(
      await recordWithholding(
        db,
        actor,
        {
          requestId: input.requestId,
          scope: input.scope,
          recordDescription: input.recordDescription,
          exemptionKey: input.exemptionKey,
          explanation: input.explanation,
          ...(input.otherCitation === null ? {} : { otherCitation: input.otherCitation }),
        },
        signal,
      ),
      'Withholding recorded.',
      {
        unknown_exemption: 'exemptionKey',
        citation_required: 'otherCitation',
        explanation_required: 'explanation',
      },
    ),
  )
}

export async function createReleaseAction(formData: FormData): Promise<ActionResult> {
  return await runStaffFormToday(formData, releaseForm, async ({ db, actor, signal }, input) =>
    recordsOutcome(
      await createRelease(
        db,
        getObjectStore(),
        getMailTransport(),
        actor,
        {
          requestId: input.requestId,
          releasedOn: input.releasedOn,
          method: input.method,
          items: input.items,
          ...(input.recipientEmail === null ? {} : { recipientEmail: input.recipientEmail }),
        },
        signal,
      ),
      'Records released.',
      {
        future_date: 'releasedOn',
        before_received: 'releasedOn',
        recipient_required: 'recipientEmail',
        approval_missing: 'items',
        approval_revoked: 'items',
        duplicate_document: 'items',
      },
    ),
  )
}

export async function closeRequestAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, closeRequestForm, async ({ db, actor, signal }, input) =>
    recordsOutcome(
      await closeRequest(
        db,
        actor,
        { requestId: input.requestId, to: input.to, expectedRowVersion: input.expectedRowVersion },
        signal,
      ),
      'Request updated.',
    ),
  )
}
