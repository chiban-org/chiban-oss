import type { ApplicationTypeBody } from '@/features/applications/applicationTypeSchema'
import type { ConditionLibraryBody } from '@/features/conditions/conditionSchema'
import type { FeeScheduleBody } from '@/features/fees/feeSchema'
import type { FormBody } from '@/features/forms/formSchema'
import type { ChecklistBody } from '@/features/inspections/checklistSchema'
import type { TextTemplateBody } from '@/features/templates/templateSchema'

export interface StarterBundle {
  id: string
  version: number
  applicationType: ApplicationTypeBody
  form: FormBody
  feeSchedule: FeeScheduleBody
  conditionLibrary: ConditionLibraryBody
  checklists: ChecklistBody[]
  templates: TextTemplateBody[]
}

export const ATTESTATION_TEXT =
  'I attest that the information in this application is true and complete, and that I am the owner of the property or the owner’s authorized agent.'
