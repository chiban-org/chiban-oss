'use server'

import { getMailTransport } from '@/features/mail/transport'
import { denyRequest } from '@/features/rtk/denial'
import type { ReleaseDelivery } from '@/features/rtk/releaseDelivery'
import { type ReissueError, reissueReleaseLink } from '@/features/rtk/releaseReissue'
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
  reissueLinkForm,
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

const RELEASED_COPY: Record<ReleaseDelivery, string> = {
  none: 'Records released.',
  attached: 'Records released and emailed to the requester.',
  link: 'Records released and a link emailed to the requester.',
  link_fallback:
    'Records released. The files were too large to attach, so the requester was emailed a link instead.',
}

export async function createReleaseAction(formData: FormData): Promise<ActionResult> {
  return await runStaffFormToday(formData, releaseForm, async ({ db, actor, signal }, input) => {
    const released = await createRelease(
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
    )
    return recordsOutcome(
      released,
      released.ok ? RELEASED_COPY[released.value.delivery] : RELEASED_COPY.none,
      {
        future_date: 'releasedOn',
        before_received: 'releasedOn',
        recipient_required: 'recipientEmail',
        approval_missing: 'items',
        approval_revoked: 'items',
        duplicate_document: 'items',
      },
    )
  })
}

const REISSUE_COPY: Partial<Record<ReissueError, string>> = {
  no_link: 'This release was not sent as a link.',
  link_revoked: 'This link was turned off, so it cannot be sent again.',
  link_active: 'The current link still works. Send a new one after it expires.',
  send_failed: 'The email could not be sent. No new link was made.',
}

export async function reissueLinkAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, reissueLinkForm, async ({ db, actor, signal }, input) => {
    const result = await reissueReleaseLink({ db, mail: getMailTransport(), signal }, actor, input)
    if (result.ok) return { ok: true, message: 'A new link was emailed.' }
    const copy = REISSUE_COPY[result.error]
    return copy === undefined ? recordsOutcome(result, '') : { ok: false, error: copy }
  })
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
