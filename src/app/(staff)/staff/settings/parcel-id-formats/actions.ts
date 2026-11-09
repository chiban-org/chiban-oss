'use server'

import {
  addIdFormat,
  chooseDisplayFormat,
  deleteIdFormat,
  editIdFormat,
  type IdFormatError,
} from '@/features/parcels/idFormatAdmin'
import type { ActionResult } from '@/server/actionRunner'
import { refuseField, runStaffForm } from '@/server/formInput'
import { ADD_FORMAT_FORM, EDIT_FORMAT_FORM, FORMAT_KEY_FORM } from './forms'

function plural(count: number): string {
  return count === 1 ? '1 parcel ID' : `${String(count)} parcel IDs`
}

function refused(error: IdFormatError): ActionResult {
  if (typeof error === 'object') {
    return refuseField(
      'width',
      `${plural(error.narrows)} already saved in this format would no longer fit. Keep the width and kind as they are, or add a new format instead.`,
    )
  }
  switch (error) {
    case 'key_taken':
      return refuseField('key', 'Another format already uses that short name.')
    case 'forbidden':
      return { ok: false, error: 'You do not have permission to change parcel ID formats.' }
    case 'not_found':
      return { ok: false, error: 'That format was not found.' }
    case 'is_display':
      return {
        ok: false,
        error: 'This is the ID shown on parcels. Choose another format to show first.',
      }
    case 'in_use':
      return {
        ok: false,
        error: 'Parcel IDs, imports or links already use this format, so it cannot be deleted.',
      }
  }
}

export async function addFormatAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, ADD_FORMAT_FORM, async ({ db, actor, signal }, input) => {
    const made = await addIdFormat(db, actor, input, signal)
    return made.ok ? { ok: true, message: `${input.label} added.` } : refused(made.error)
  })
}

export async function editFormatAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, EDIT_FORMAT_FORM, async ({ db, actor, signal }, input) => {
    const saved = await editIdFormat(db, actor, input, signal)
    return saved.ok ? { ok: true, message: 'Format saved.' } : refused(saved.error)
  })
}

export async function displayFormatAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, FORMAT_KEY_FORM, async ({ db, actor, signal }, input) => {
    const chosen = await chooseDisplayFormat(db, actor, input, signal)
    return chosen.ok ? { ok: true, message: 'Display format changed.' } : refused(chosen.error)
  })
}

export async function deleteFormatAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, FORMAT_KEY_FORM, async ({ db, actor, signal }, input) => {
    const removed = await deleteIdFormat(db, actor, input, signal)
    return removed.ok ? { ok: true, message: 'Format deleted.' } : refused(removed.error)
  })
}
