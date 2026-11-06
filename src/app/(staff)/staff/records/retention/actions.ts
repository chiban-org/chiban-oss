'use server'

import { approveDisposition, cancelDisposition } from '@/features/disposition/approve'
import { executeDisposition } from '@/features/disposition/execute'
import { proposeDisposition } from '@/features/disposition/propose'
import { finishDisposition } from '@/features/files/releaseFile'
import { recordRetentionEvent } from '@/features/records/recordEvents'
import { getObjectStore } from '@/features/storage/objectStore'
import type { ActionResult } from '@/server/actionRunner'
import { runStaffForm } from '@/server/formInput'
import { runStaffFormToday } from '@/server/formInputToday'
import { recordsOutcome } from '@/server/recordsAction'
import { batchForm, proposeForm, recordEventForm } from './retentionForms'

export async function recordRetentionEventAction(formData: FormData): Promise<ActionResult> {
  return await runStaffFormToday(formData, recordEventForm, async ({ db, actor, signal }, input) =>
    recordsOutcome(
      await recordRetentionEvent(
        db,
        actor,
        {
          target:
            input.targetKind === 'case'
              ? { caseId: input.targetId }
              : { projectId: input.targetId },
          kind: input.kind,
          occurredOn: input.occurredOn,
          ...(input.note === null ? {} : { note: input.note }),
        },
        signal,
      ),
      'Event recorded. The retention clock now runs from that date.',
      { kind_not_for_target: 'kind', future_date: 'occurredOn' },
    ),
  )
}

export async function proposeDispositionAction(formData: FormData): Promise<ActionResult> {
  return await runStaffFormToday(formData, proposeForm, async ({ db, actor, signal }, input) =>
    recordsOutcome(
      await proposeDisposition(db, actor, { asOf: input.asOf }, signal),
      'Batch proposed. A records custodian has to approve it before anything is disposed of.',
      { nothing_eligible: 'asOf', future_date: 'asOf' },
    ),
  )
}

export async function approveDispositionAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, batchForm, async ({ db, actor, signal }, input) => {
    const approved = await approveDisposition(db, actor, { batchId: input.batchId }, signal)
    if (!approved.ok) return recordsOutcome(approved, '')
    const ran = await executeDisposition(db, { batchId: input.batchId }, signal)
    if (!ran.ok) return recordsOutcome(ran, '')
    await finishDisposition(db, getObjectStore(), input.batchId, signal)
    return {
      ok: true,
      message: 'Batch approved and carried out. Each disposed record left a tombstone.',
    }
  })
}

export async function cancelDispositionAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, batchForm, async ({ db, actor, signal }, input) =>
    recordsOutcome(
      await cancelDisposition(db, actor, { batchId: input.batchId }, signal),
      'Batch cancelled.',
    ),
  )
}
