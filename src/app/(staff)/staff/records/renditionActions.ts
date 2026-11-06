'use server'

import { z } from 'zod'
import { APPROVAL_PURPOSES } from '@/db/schema'
import { optionalRecordId } from '@/features/input/optionalRecordId'
import { choice, recordId, requiredText } from '@/features/input/schemas'
import { approveRendition, revokeApproval } from '@/features/renditions/approvals'
import { getObjectStore } from '@/features/storage/objectStore'
import type { ActionResult } from '@/server/actionRunner'
import { runStaffForm } from '@/server/formInput'
import { recordsOutcome } from '@/server/recordsAction'

const MIN_REASON = 10
const MAX_STATEMENT = 2000

const APPROVE_FORM = z.object({
  versionId: recordId('a version'),
  purpose: choice('what the version is approved for', APPROVAL_PURPOSES),
  rtkRequestId: optionalRecordId('Choose a request.'),
  reviewStatement: requiredText('a review statement', { max: MAX_STATEMENT }),
})

const REVOKE_FORM = z.object({
  approvalId: recordId('an approval'),
  reason: requiredText('a reason', { min: MIN_REASON, max: MAX_STATEMENT }),
})

export async function approveRenditionAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, APPROVE_FORM, async ({ db, actor, signal }, input) =>
    recordsOutcome(
      await approveRendition(
        db,
        actor,
        {
          versionId: input.versionId,
          purpose: input.purpose,
          reviewStatement: input.reviewStatement,
          ...(input.rtkRequestId === null ? {} : { rtkRequestId: input.rtkRequestId }),
        },
        signal,
        getObjectStore(),
      ),
      'Version approved.',
      { wrong_role: 'versionId', not_ready: 'versionId' },
    ),
  )
}

export async function revokeApprovalAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, REVOKE_FORM, async ({ db, actor, signal }, input) =>
    recordsOutcome(
      await revokeApproval(
        db,
        actor,
        { approvalId: input.approvalId, reason: input.reason },
        signal,
        getObjectStore(),
      ),
      'Approval revoked. The version is no longer served anywhere.',
      { reason_required: 'reason' },
    ),
  )
}
