'use server'

import { z } from 'zod'
import {
  RTK_RECEIVED_VIA,
  RTK_RELEASE_METHODS,
  RTK_RESPONSE_KINDS,
  RTK_WITHHOLDING_SCOPES,
} from '@/db/schema'
import { getMailTransport } from '@/features/mail/transport'
import { createRelease } from '@/features/rtk/releases'
import { closeRequest, logRequest } from '@/features/rtk/requests'
import { recordFirstResponse } from '@/features/rtk/responses'
import { recordWithholding } from '@/features/rtk/withholdings'
import { getObjectStore } from '@/features/storage/objectStore'
import type { ActionResult } from '@/server/actionRunner'
import {
  dateField,
  optionalField,
  RECORDS_COPY,
  runRecords,
  uuidField,
} from '@/server/recordsAction'

const CENTS_PER_DOLLAR = 100

export async function logRequestAction(formData: FormData): Promise<ActionResult> {
  return await runRecords(
    formData,
    z.object({
      receivedOn: dateField,
      receivedVia: z.enum(RTK_RECEIVED_VIA),
      requesterName: optionalField(z.string()),
      requesterContact: optionalField(z.string()),
      description: z.string().min(1),
    }),
    ({ db, actor, signal }, v) =>
      logRequest(
        db,
        actor,
        {
          receivedOn: v.receivedOn,
          receivedVia: v.receivedVia,
          description: v.description,
          ...(v.requesterName === undefined ? {} : { requesterName: v.requesterName }),
          ...(v.requesterContact === undefined ? {} : { requesterContact: v.requesterContact }),
        },
        signal,
      ),
    'Request logged.',
  )
}

export async function firstResponseAction(formData: FormData): Promise<ActionResult> {
  return await runRecords(
    formData,
    z.object({
      requestId: uuidField,
      kind: z.enum(RTK_RESPONSE_KINDS),
      respondedOn: dateField,
      websiteUrl: optionalField(z.string()),
      statedDate: optionalField(dateField),
      delayReason: optionalField(z.string()),
      costLabel: optionalField(z.string()),
      costDollars: optionalField(z.coerce.number().min(0)),
    }),
    ({ db, actor, signal }, v) =>
      recordFirstResponse(
        db,
        getObjectStore(),
        actor,
        {
          requestId: v.requestId,
          kind: v.kind,
          respondedOn: v.respondedOn,
          ...(v.websiteUrl === undefined ? {} : { websiteUrl: v.websiteUrl }),
          ...(v.statedDate === undefined
            ? {}
            : {
                timeStatement: {
                  statedDate: v.statedDate,
                  delayReason: v.delayReason ?? '',
                  costEstimate:
                    v.costLabel === undefined || v.costDollars === undefined
                      ? []
                      : [
                          {
                            label: v.costLabel,
                            cents: Math.round(v.costDollars * CENTS_PER_DOLLAR),
                          },
                        ],
                },
              }),
        },
        signal,
      ),
    'Response recorded and the letter filed.',
  )
}

export async function withholdingAction(formData: FormData): Promise<ActionResult> {
  return await runRecords(
    formData,
    z.object({
      requestId: uuidField,
      scope: z.enum(RTK_WITHHOLDING_SCOPES),
      recordDescription: z.string().min(1),
      exemptionKey: z.string().min(1),
      otherCitation: optionalField(z.string()),
      explanation: z.string(),
    }),
    ({ db, actor, signal }, v) =>
      recordWithholding(
        db,
        actor,
        {
          requestId: v.requestId,
          scope: v.scope,
          recordDescription: v.recordDescription,
          exemptionKey: v.exemptionKey,
          explanation: v.explanation,
          ...(v.otherCitation === undefined ? {} : { otherCitation: v.otherCitation }),
        },
        signal,
      ),
    'Withholding recorded.',
    { exemptionKey: RECORDS_COPY.unknown_exemption ?? '' },
  )
}

const itemPair = z
  .string()
  .min(1)
  .transform((s) =>
    s
      .split(',')
      .filter((x) => x !== '')
      .map((pair) => {
        const [documentId = '', approvalId = ''] = pair.split(':')
        return { documentId, approvalId }
      }),
  )

export async function createReleaseAction(formData: FormData): Promise<ActionResult> {
  return await runRecords(
    formData,
    z.object({
      requestId: uuidField,
      releasedOn: dateField,
      method: z.enum(RTK_RELEASE_METHODS),
      recipientEmail: optionalField(z.string()),
      items: itemPair,
    }),
    ({ db, actor, signal }, v) =>
      createRelease(
        db,
        getObjectStore(),
        getMailTransport(),
        actor,
        {
          requestId: v.requestId,
          releasedOn: v.releasedOn,
          method: v.method,
          items: v.items,
          ...(v.recipientEmail === undefined ? {} : { recipientEmail: v.recipientEmail }),
        },
        signal,
      ),
    'Records released.',
    {
      items: 'Tick at least one approved record to release.',
      releasedOn: 'Enter the date the records were released.',
    },
  )
}

export async function closeRequestAction(formData: FormData): Promise<ActionResult> {
  return await runRecords(
    formData,
    z.object({
      requestId: uuidField,
      to: z.enum(['closed', 'withdrawn']),
      expectedRowVersion: z.coerce.number().int(),
    }),
    ({ db, actor, signal }, v) =>
      closeRequest(
        db,
        actor,
        { requestId: v.requestId, to: v.to, expectedRowVersion: v.expectedRowVersion },
        signal,
      ),
    'Request updated.',
  )
}
