import type { z } from 'zod'
import { CHECK_ONLY_FIELD, CHECK_PASSED_COPY } from '@/constants/formCheck'
import { CSRF_FIELD, type GuardOptions, isCheckOnly } from '@/server/actionGuard'
import { type ActionContext, type ActionResult, runStaffAction } from '@/server/actionRunner'
import { err, ok, type Result } from '@/types/result'

export type ActionFailure = Extract<ActionResult, { ok: false }>

export type FormValues = Record<string, FormDataEntryValue | FormDataEntryValue[]>

const NOT_INPUT = new Set([CSRF_FIELD, CHECK_ONLY_FIELD])

const PLAIN_MESSAGE = 'Check this field.'

export const CHECK_PASSED: ActionFailure = { ok: false, error: CHECK_PASSED_COPY }

export function formValues(formData: FormData): FormValues {
  const values: FormValues = {}
  for (const name of new Set(formData.keys())) {
    if (NOT_INPUT.has(name)) continue
    const all = formData.getAll(name)
    values[name] = all.length === 1 ? (all[0] as FormDataEntryValue) : all
  }
  return values
}

export function refusedInput(error: z.ZodError): ActionFailure {
  const fieldErrors: Record<string, string> = {}
  const summary: string[] = []
  for (const issue of error.issues) {
    const message = issue.code === 'custom' ? issue.message : PLAIN_MESSAGE
    const field = issue.path[0]
    if (typeof field === 'string' && field in fieldErrors) continue
    if (typeof field === 'string') fieldErrors[field] = message
    if (!summary.includes(message)) summary.push(message)
  }
  return { ok: false, error: summary.join(' '), fieldErrors }
}

export function refuseField(field: string, message: string): ActionFailure {
  return { ok: false, error: message, fieldErrors: { [field]: message } }
}

export function parseForm<S extends z.ZodType>(
  schema: S,
  formData: FormData,
): Result<z.output<S>, ActionFailure> {
  const parsed = schema.safeParse(formValues(formData))
  return parsed.success ? ok(parsed.data) : err(refusedInput(parsed.error))
}

export async function runStaffForm<S extends z.ZodType>(
  formData: FormData,
  schema: S,
  fn: (ctx: ActionContext, input: z.output<S>) => Promise<ActionResult>,
  options: Omit<GuardOptions, 'answersCheck'> = {},
): Promise<ActionResult> {
  return await runStaffAction(
    formData,
    async (ctx) => {
      const parsed = parseForm(schema, formData)
      if (!parsed.ok) return parsed.error
      if (isCheckOnly(formData)) return CHECK_PASSED
      return await fn(ctx, parsed.value)
    },
    { ...options, answersCheck: true },
  )
}
