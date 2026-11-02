'use server'

import { z } from 'zod'
import { APPROVAL_PURPOSES } from '@/db/schema'
import { approveRendition, revokeApproval } from '@/features/renditions/approvals'
import { getObjectStore } from '@/features/storage/objectStore'
import type { ActionResult } from '@/server/actionRunner'
import { optionalField, runRecords, uuidField } from '@/server/recordsAction'

export async function approveRenditionAction(formData: FormData): Promise<ActionResult> {
  return await runRecords(
    formData,
    z.object({
      versionId: uuidField,
      purpose: z.enum(APPROVAL_PURPOSES),
      rtkRequestId: optionalField(uuidField),
      reviewStatement: z.string().min(1),
    }),
    ({ db, actor, signal }, v) =>
      approveRendition(
        db,
        actor,
        {
          versionId: v.versionId,
          purpose: v.purpose,
          reviewStatement: v.reviewStatement,
          ...(v.rtkRequestId === undefined ? {} : { rtkRequestId: v.rtkRequestId }),
        },
        signal,
        getObjectStore(),
      ),
    'Version approved.',
  )
}

export async function revokeApprovalAction(formData: FormData): Promise<ActionResult> {
  return await runRecords(
    formData,
    z.object({ approvalId: uuidField, reason: z.string() }),
    ({ db, actor, signal }, v) =>
      revokeApproval(
        db,
        actor,
        { approvalId: v.approvalId, reason: v.reason },
        signal,
        getObjectStore(),
      ),
    'Approval revoked. The version is no longer served anywhere.',
  )
}
