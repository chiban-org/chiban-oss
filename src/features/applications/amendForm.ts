import type { DbOrTx } from '@/db/client'
import { loadApplicationContext } from '@/features/applications/context'
import type { CoreState } from '@/features/applications/states'
import { amendPermission } from '@/features/applications/submitApplication'
import type { Actor } from '@/features/auth/actor'
import { getVersion } from '@/features/config/store'
import type { FormBody } from '@/features/forms/formSchema'
import type { FieldValue } from '@/features/forms/validateSubmission'
import { hasFullRecordAccess } from '@/features/projects/access'

export interface AmendFormData {
  applicationId: string
  number: string
  form: FormBody
  values: Record<string, FieldValue>
}

const STAFF_EDITABLE: readonly CoreState[] = ['submitted', 'under_review']

export async function loadAmendForm(
  db: DbOrTx,
  actor: Actor,
  applicationId: string,
  signal: AbortSignal,
): Promise<AmendFormData | null> {
  signal.throwIfAborted()
  if (!hasFullRecordAccess(actor)) return null
  const app = await loadApplicationContext(db, applicationId, signal)
  if (app === null || !STAFF_EDITABLE.includes(app.state)) return null
  if ((await amendPermission(db, actor, app, signal)) !== 'ok') return null
  const form = (await getVersion(db, app.pins.form, signal))?.body as FormBody | undefined
  if (form === undefined) return null
  return { applicationId, number: app.number, form, values: app.values }
}
