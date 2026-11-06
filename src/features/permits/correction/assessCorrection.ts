import type { DbOrTx } from '@/db/client'
import type { ApplicationContext } from '@/features/applications/context'
import { keepStaffOnlyValues } from '@/features/applications/submitApplication'
import { getVersion } from '@/features/config/store'
import type { FormBody } from '@/features/forms/formSchema'
import {
  type FieldError,
  type FieldValue,
  validateSubmission,
} from '@/features/forms/validateSubmission'
import { feesWouldChange } from '@/features/permits/correction/feeCheck'
import { err, ok, type Result } from '@/types/result'

export interface Assessed {
  values: Record<string, FieldValue>
  review: string[]
  feeChange: boolean
}

function same(a: FieldValue | undefined, b: FieldValue | undefined): boolean {
  return (
    JSON.stringify(a === false ? null : (a ?? null)) ===
    JSON.stringify(b === false ? null : (b ?? null))
  )
}

export function reviewChanges(
  form: FormBody,
  before: Record<string, FieldValue>,
  after: Record<string, FieldValue>,
): string[] {
  return form.fields
    .filter((f) => f.fact !== undefined && !same(before[f.key], after[f.key]))
    .map((f) => f.label)
}

export async function assessCorrection(
  db: DbOrTx,
  app: ApplicationContext,
  raw: Record<string, unknown>,
  signal: AbortSignal,
): Promise<Result<Assessed, { fieldErrors: FieldError[] }>> {
  const form = (await getVersion(db, app.pins.form, signal))?.body as FormBody
  const merged = keepStaffOnlyValues(form, app.values, raw as Record<string, FieldValue>)
  const checked = validateSubmission(form, merged, { asStaff: true })
  if (!checked.ok) return err({ fieldErrors: checked.error })
  const values = checked.value.values
  const review = reviewChanges(form, app.values, values)
  const feeChange = review.length === 0 && (await feesWouldChange(db, app, values, signal))
  return ok({ values, review, feeChange })
}
