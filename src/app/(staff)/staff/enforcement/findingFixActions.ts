'use server'

import {
  editFinding,
  markFindingCorrected,
  withdrawFinding,
} from '@/features/enforcement/findingChanges'
import type { ActionResult } from '@/server/actionRunner'
import { runStaffFormToday } from '@/server/formInputToday'
import { settled } from './enforcementResult'
import { correctedFindingForm, editFindingForm, withdrawFindingForm } from './findingFixForms'

export async function editFindingAction(formData: FormData): Promise<ActionResult> {
  return await runStaffFormToday(formData, editFindingForm, async ({ db, actor, signal }, input) =>
    settled(await editFinding(db, actor, input, signal), 'Finding saved.'),
  )
}

export async function withdrawFindingAction(formData: FormData): Promise<ActionResult> {
  return await runStaffFormToday(
    formData,
    withdrawFindingForm,
    async ({ db, actor, signal }, input) => {
      const withdrawn = await withdrawFinding(db, actor, input, signal)
      const back = withdrawn.ok && withdrawn.value.caseStatus === 'investigating'
      return settled(
        withdrawn,
        back
          ? 'Finding withdrawn. Every finding is withdrawn, so the case is back under investigation.'
          : 'Finding withdrawn.',
      )
    },
  )
}

export async function markFindingCorrectedAction(formData: FormData): Promise<ActionResult> {
  return await runStaffFormToday(
    formData,
    correctedFindingForm,
    async ({ db, actor, signal }, input) =>
      settled(
        await markFindingCorrected(db, actor, { ...input, note: input.note ?? '' }, signal),
        'Finding marked corrected.',
      ),
  )
}
