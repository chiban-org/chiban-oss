import type { DbOrTx } from '@/db/client'
import type { ApplicationTypeBody } from '@/features/applications/applicationTypeSchema'
import { getPublished } from '@/features/config/store'
import { CUTOVER_BASE_COLUMNS } from '@/features/cutover/columns'
import type { FormBody } from '@/features/forms/formSchema'

export async function cutoverTemplate(
  db: DbOrTx,
  applicationTypeKey: string,
  signal: AbortSignal,
): Promise<string> {
  const type = await getPublished(db, 'application_type', applicationTypeKey, signal)
  if (type === null) return CUTOVER_BASE_COLUMNS.join(',')
  const form = await getPublished(db, 'form', (type.body as ApplicationTypeBody).formKey, signal)
  const fields = (form?.body as FormBody | undefined)?.fields ?? []
  return [...CUTOVER_BASE_COLUMNS, ...fields.map((f) => `field.${f.key}`)].join(',')
}
