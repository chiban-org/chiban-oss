import { CLASSIFICATION_KEYS } from '@packs/nh/schema'
import { z } from 'zod'
import { CORE_STATES } from '@/features/applications/states'

export const ApplicationTypeBodySchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  prefix: z.string().regex(/^[A-Z]{1,4}$/),
  classification: z.enum(CLASSIFICATION_KEYS).optional(),
  formKey: z.string().min(1),
  feeScheduleKey: z.string().min(1),
  conditionLibraryKey: z.string().min(1),
  checklistKeys: z.array(z.string().min(1)),
  templateKeys: z.array(z.string().min(1)),
  payTiming: z.enum(['at_intake', 'at_approval']),
  attestationText: z.string().min(1),
  bindings: z.array(z.string().min(1)),
  workflow: z.object({
    allowsDirectIssue: z.boolean(),
    substeps: z.array(
      z.object({ state: z.enum(CORE_STATES), key: z.string().min(1), label: z.string().min(1) }),
    ),
    closesOn: z.enum(['final_inspection_passed', 'certificate_of_occupancy', 'staff_closes']),
  }),
})
export type ApplicationTypeBody = z.infer<typeof ApplicationTypeBodySchema>
