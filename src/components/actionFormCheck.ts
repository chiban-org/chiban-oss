import { CHECK_ONLY_FIELD, CHECK_PASSED_COPY, CHECK_UNSUPPORTED_COPY } from '@/constants/formCheck'
import type { ActionResult } from '@/server/actionRunner'

export const UNSENT_COPY =
  'The form could not be sent. Check your connection and any attached files, then try again.'

export async function sendOrExplain(
  action: (formData: FormData) => Promise<ActionResult>,
  formData: FormData,
): Promise<ActionResult> {
  try {
    return await action(formData)
  } catch {
    return { ok: false, error: UNSENT_COPY }
  }
}

export function checkOnlyData(form: HTMLFormElement, submitter: HTMLElement | null): FormData {
  const data = submitter === null ? new FormData(form) : new FormData(form, submitter)
  data.set(CHECK_ONLY_FIELD, '1')
  return data
}

const OPENS_CONFIRM = new Set([CHECK_PASSED_COPY, CHECK_UNSUPPORTED_COPY])

export function checkPasses(reply: ActionResult): boolean {
  return reply.ok || OPENS_CONFIRM.has(reply.error)
}

const NO_FIELD_ERRORS: Readonly<Record<string, string>> = {}

export interface FormDisplay {
  message: string | null
  failed: boolean
  fieldErrors: Readonly<Record<string, string>>
}

export function formDisplay(problem: string | null, reply: ActionResult | null): FormDisplay {
  if (problem !== null) return { message: problem, failed: true, fieldErrors: NO_FIELD_ERRORS }
  if (reply === null) return { message: null, failed: false, fieldErrors: NO_FIELD_ERRORS }
  if (reply.ok) return { message: reply.message, failed: false, fieldErrors: NO_FIELD_ERRORS }
  return { message: reply.error, failed: true, fieldErrors: reply.fieldErrors ?? NO_FIELD_ERRORS }
}
