import { NH_CLASSIFICATIONS } from '@packs/nh/classifications'
import { CLASSIFICATION_KEYS } from '@packs/nh/schema'
import { z } from 'zod'
import { DocumentItemSchema, documentItemIssues } from '@/features/applications/documentItemSchema'
import { CORE_STATES } from '@/features/applications/states'

const STEP_NAME_REQUIRED = 'Name every step.'

const ApplicationTypeBodyShape = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  prefix: z.string().regex(/^[A-Z]{1,4}$/, 'Use one to four capital letters, such as BP.'),
  classification: z
    .enum(CLASSIFICATION_KEYS)
    .exclude(['nh.enforcement_zoning', 'nh.enforcement_building_code'])
    .optional(),
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
      z.object({
        state: z.enum(CORE_STATES),
        key: z.string().min(1, STEP_NAME_REQUIRED),
        label: z.string().min(1, STEP_NAME_REQUIRED),
      }),
    ),
    closesOn: z.enum([
      'final_inspection_passed',
      'certificate_of_occupancy',
      'staff_closes',
      'issuance',
      'expiration',
    ]),
  }),
  documents: z.array(DocumentItemSchema).optional(),
})

function boardKindOf(classification: string | undefined): string | null {
  return NH_CLASSIFICATIONS.find((c) => c.key === classification)?.boardKind ?? null
}

export const ApplicationTypeBodySchema = ApplicationTypeBodyShape.superRefine((body, ctx) => {
  for (const issue of documentItemIssues(body.documents ?? [], boardKindOf(body.classification))) {
    ctx.addIssue({
      code: 'custom',
      message: issue.message,
      path: ['documents', issue.index, issue.field],
    })
  }
})
export type ApplicationTypeBody = z.infer<typeof ApplicationTypeBodySchema>
