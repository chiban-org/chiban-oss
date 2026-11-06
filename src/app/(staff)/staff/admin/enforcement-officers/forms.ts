import { z } from 'zod'
import { civilDate, recordId, requiredText } from '@/features/input/schemas'
import type { CivilDate } from '@/types/civilDate'

const MAX_TEXT = 200

const designationFields = (today: CivilDate) => ({
  title: requiredText('a title', { max: MAX_TEXT }),
  adoptingAuthority: requiredText('who designated them', { max: MAX_TEXT }),
  adoptedOn: civilDate('the date adopted', { latest: today }),
})

export const designateForm = (today: CivilDate) =>
  z.object({ userId: recordId('an officer'), ...designationFields(today) })

export const updateForm = (today: CivilDate) =>
  z.object({ designationId: recordId('a designation'), ...designationFields(today) })

export const END_FORM = z.object({
  designationId: recordId('a designation'),
  endedOn: civilDate('the last day as officer'),
})
