import { and, eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { configVersions } from '@/db/schema'
import type { ApplicationTypeBody } from '@/features/applications/applicationTypeSchema'
import { getPublished } from '@/features/config/store'
import { CUTOVER_BASE_COLUMNS } from '@/features/cutover/columns'
import type { FormBody } from '@/features/forms/formSchema'

export { CUTOVER_FEES_PAID_VALUES } from '@/features/cutover/columns'

async function fieldKeysOfType(
  db: DbOrTx,
  type: { body: unknown },
  signal: AbortSignal,
): Promise<string[]> {
  const form = await getPublished(db, 'form', (type.body as ApplicationTypeBody).formKey, signal)
  return ((form?.body as FormBody | undefined)?.fields ?? []).map((f) => f.key)
}

export async function cutoverTemplate(
  db: DbOrTx,
  applicationTypeKey: string,
  signal: AbortSignal,
): Promise<string> {
  const types =
    applicationTypeKey === ''
      ? await db
          .select()
          .from(configVersions)
          .where(
            and(
              eq(configVersions.kind, 'application_type'),
              eq(configVersions.status, 'published'),
            ),
          )
      : [await getPublished(db, 'application_type', applicationTypeKey, signal)].filter(
          (t) => t !== null,
        )
  const keys = new Set<string>()
  for (const type of types) {
    for (const key of await fieldKeysOfType(db, type, signal)) keys.add(key)
  }
  return [...CUTOVER_BASE_COLUMNS, ...[...keys].map((k) => `field.${k}`)].join(',')
}
