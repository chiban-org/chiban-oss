'use server'

import { z } from 'zod'
import { approveDisposition, cancelDisposition } from '@/features/disposition/approve'
import { executeDisposition } from '@/features/disposition/execute'
import { proposeDisposition } from '@/features/disposition/propose'
import { finishDisposition } from '@/features/files/releaseFile'
import { recordRetentionEvent } from '@/features/records/recordEvents'
import { getObjectStore } from '@/features/storage/objectStore'
import type { ActionResult } from '@/server/actionRunner'
import { dateField, optionalField, runRecords, uuidField } from '@/server/recordsAction'
import { err, ok } from '@/types/result'

export async function recordRetentionEventAction(formData: FormData): Promise<ActionResult> {
  return await runRecords(
    formData,
    z.object({
      targetKind: z.enum(['project', 'case']),
      targetId: uuidField,
      kind: z.enum(['building_removed', 'septic_replaced_or_removed', 'appeal_period_expired']),
      occurredOn: dateField,
      note: optionalField(z.string()),
    }),
    ({ db, actor, signal }, v) =>
      recordRetentionEvent(
        db,
        actor,
        {
          target: v.targetKind === 'case' ? { caseId: v.targetId } : { projectId: v.targetId },
          kind: v.kind,
          occurredOn: v.occurredOn,
          ...(v.note === undefined ? {} : { note: v.note }),
        },
        signal,
      ),
    'Event recorded. The retention clock now runs from that date.',
  )
}

export async function proposeDispositionAction(formData: FormData): Promise<ActionResult> {
  return await runRecords(
    formData,
    z.object({ asOf: dateField }),
    ({ db, actor, signal }, v) => proposeDisposition(db, actor, { asOf: v.asOf }, signal),
    'Batch proposed. A records custodian has to approve it before anything is disposed of.',
  )
}

export async function approveDispositionAction(formData: FormData): Promise<ActionResult> {
  return await runRecords(
    formData,
    z.object({ batchId: uuidField }),
    async ({ db, actor, signal }, v) => {
      const approved = await approveDisposition(db, actor, { batchId: v.batchId }, signal)
      if (!approved.ok) return err(approved.error)
      const ran = await executeDisposition(db, { batchId: v.batchId }, signal)
      if (!ran.ok) return err(ran.error)
      await finishDisposition(db, getObjectStore(), v.batchId, signal)
      return ok(undefined)
    },
    'Batch approved and carried out. Each disposed record left a tombstone.',
  )
}

export async function cancelDispositionAction(formData: FormData): Promise<ActionResult> {
  return await runRecords(
    formData,
    z.object({ batchId: uuidField }),
    ({ db, actor, signal }, v) => cancelDisposition(db, actor, { batchId: v.batchId }, signal),
    'Batch cancelled.',
  )
}
