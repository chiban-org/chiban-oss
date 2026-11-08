'use server'

import {
  addTownSection,
  editTownSection,
  retireTownSection,
  type SaveSectionError,
} from '@/features/enforcement/sections/townSections'
import type { ActionResult } from '@/server/actionRunner'
import { refuseField, runStaffForm } from '@/server/formInput'
import { ADD_SECTION_FORM, EDIT_SECTION_FORM, RETIRE_SECTION_FORM } from './forms'

const COPY: Record<Exclude<SaveSectionError, 'reference_taken'>, string> = {
  forbidden: 'You do not have permission to change the section list.',
  not_found: 'That section was not found.',
  retired: 'That section is retired. Add it again instead.',
}

function refused(error: SaveSectionError): ActionResult {
  if (error === 'reference_taken') {
    return refuseField('reference', 'This section is already on the list for that kind.')
  }
  return { ok: false, error: COPY[error] }
}

export async function addSectionAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, ADD_SECTION_FORM, async ({ db, actor, signal }, input) => {
    const made = await addTownSection(db, actor, { ...input, title: input.title ?? '' }, signal)
    return made.ok ? { ok: true, message: `${input.reference} added.` } : refused(made.error)
  })
}

export async function editSectionAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, EDIT_SECTION_FORM, async ({ db, actor, signal }, input) => {
    const saved = await editTownSection(db, actor, { ...input, title: input.title ?? '' }, signal)
    return saved.ok ? { ok: true, message: 'Section saved.' } : refused(saved.error)
  })
}

export async function retireSectionAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, RETIRE_SECTION_FORM, async ({ db, actor, signal }, input) => {
    const retired = await retireTownSection(db, actor, input, signal)
    return retired.ok ? { ok: true, message: 'Section retired.' } : refused(retired.error)
  })
}
