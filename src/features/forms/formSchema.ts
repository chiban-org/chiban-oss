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
] as const
export type FieldType = (typeof FIELD_TYPES)[number]

export const FormFieldSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]*$/),
  label: z.string().min(1),
  help: z.string().optional(),
  type: z.enum(FIELD_TYPES),
  required: z.boolean(),
  options: z.array(z.object({ value: z.string().min(1), label: z.string().min(1) })).optional(),
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

export const FormBodySchema = z
  .object({
    key: z.string().min(1),
    label: z.string().min(1),
    fields: z.array(FormFieldSchema).min(1),
  })
  .superRefine((form, ctx) => {
    const earlier = new Set<string>()
    form.fields.forEach((field, i) => {
      if (earlier.has(field.key)) {
        ctx.addIssue({ code: 'custom', path: ['fields', i, 'key'], message: 'duplicate key' })
      }
      const needsOptions = field.type === 'select' || field.type === 'multiselect'
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
      earlier.add(field.key)
    })
  })
export type FormBody = z.infer<typeof FormBodySchema>
