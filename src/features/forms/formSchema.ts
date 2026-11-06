import { z } from 'zod'
import { ConditionSchema, conditionFields } from '@/features/forms/condition'

export const FIELD_TYPES = [
  'text',
  'textarea',
  'integer',
  'decimal',
  'money',
  'date',
  'select',
  'multiselect',
  'checkbox',
  'email',
  'phone',
  'section',
] as const
export type FieldType = (typeof FIELD_TYPES)[number]

export const FormFieldSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]*$/),
  label: z.string().trim().min(1),
  help: z.string().optional(),
  type: z.enum(FIELD_TYPES),
  required: z.boolean(),
  options: z
    .array(z.object({ value: z.string().trim().min(1), label: z.string().trim().min(1) }))
    .optional(),
  validation: z
    .object({
      minLength: z.number().optional(),
      maxLength: z.number().optional(),
      min: z.number().optional(),
      max: z.number().optional(),
    })
    .optional(),
  showIf: ConditionSchema.optional(),
  requireIf: ConditionSchema.optional(),
  fact: z.enum(['classification', 'dwellingUnits', 'afterTheFact']).optional(),
  staffOnly: z.boolean().optional(),
})
export type FormField = z.infer<typeof FormFieldSchema>

const CHOICE_TYPES: ReadonlySet<FieldType> = new Set(['select', 'multiselect'])
const NUMBER_TYPES: ReadonlySet<FieldType> = new Set(['integer', 'decimal', 'money'])

export function isChoiceType(type: FieldType): boolean {
  return CHOICE_TYPES.has(type)
}

export function isNumberType(type: FieldType): boolean {
  return NUMBER_TYPES.has(type)
}

export function isSection(field: FormField): boolean {
  return field.type === 'section'
}

export function questionsOf(fields: readonly FormField[]): FormField[] {
  return fields.filter((f) => !isSection(f))
}

function sectionIssue(field: FormField): string | null {
  if (field.required) return 'a section cannot be required'
  const extras = {
    options: field.options,
    validation: field.validation,
    showIf: field.showIf,
    requireIf: field.requireIf,
    fact: field.fact,
  }
  const extra = Object.entries(extras).find(([, value]) => value !== undefined)
  return extra === undefined ? null : `a section cannot have ${extra[0]}`
}

export const FormBodySchema = z
  .object({
    key: z.string().min(1),
    label: z.string().trim().min(1),
    fields: z.array(FormFieldSchema).min(1),
  })
  .superRefine((form, ctx) => {
    const seen = new Set<string>()
    const earlier = new Set<string>()
    form.fields.forEach((field, i) => {
      if (seen.has(field.key)) {
        ctx.addIssue({ code: 'custom', path: ['fields', i, 'key'], message: 'duplicate key' })
      }
      seen.add(field.key)
      const misuse = isSection(field) ? sectionIssue(field) : null
      if (misuse !== null) {
        ctx.addIssue({ code: 'custom', path: ['fields', i, 'type'], message: misuse })
      }
      const needsOptions = isChoiceType(field.type)
      if (needsOptions && (field.options === undefined || field.options.length === 0)) {
        ctx.addIssue({
          code: 'custom',
          path: ['fields', i, 'options'],
          message: 'options required',
        })
      }
      for (const name of ['showIf', 'requireIf'] as const) {
        const condition = field[name]
        if (condition === undefined) continue
        for (const ref of conditionFields(condition)) {
          if (!earlier.has(ref)) {
            ctx.addIssue({
              code: 'custom',
              path: ['fields', i, name],
              message: `condition references ${ref}, which is not an earlier field`,
            })
          }
        }
      }
      if (!isSection(field)) earlier.add(field.key)
    })
  })
export type FormBody = z.infer<typeof FormBodySchema>
