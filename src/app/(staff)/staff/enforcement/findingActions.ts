'use server'

import { recordFinding } from '@/features/enforcement/findings'
import { addNote } from '@/features/enforcement/notes'
import { recordNoticeReceipt, sendViolationNotice } from '@/features/enforcement/notices'
import { getObjectStore } from '@/features/storage/objectStore'
import type { ActionResult } from '@/server/actionRunner'
import { runStaffFormToday } from '@/server/formInputToday'
import { addNoteForm, recordFindingForm, recordReceiptForm, sendNoticeForm } from './caseForms'
import { settled } from './enforcementResult'

export async function addNoteAction(formData: FormData): Promise<ActionResult> {
  return await runStaffFormToday(formData, addNoteForm, async ({ db, actor, signal }, input) =>
    settled(await addNote(db, actor, input, signal), 'Note added.'),
  )
}

export async function recordFindingAction(formData: FormData): Promise<ActionResult> {
  return await runStaffFormToday(
    formData,
    recordFindingForm,
    async ({ db, actor, signal }, input) =>
      settled(await recordFinding(db, actor, input, signal), 'Finding recorded.'),
  )
}

export async function sendNoticeAction(formData: FormData): Promise<ActionResult> {
  return await runStaffFormToday(formData, sendNoticeForm, async ({ db, actor, signal }, input) =>
    settled(
      await sendViolationNotice(db, getObjectStore(), actor, input, signal),
      'Notice of violation recorded.',
      { findings_invalid: 'findingIds' },
    ),
  )
}

export async function recordNoticeReceiptAction(formData: FormData): Promise<ActionResult> {
  return await runStaffFormToday(
    formData,
    recordReceiptForm,
    async ({ db, actor, signal }, input) =>
      settled(await recordNoticeReceipt(db, actor, input, signal), 'Receipt recorded.'),
  )
}
