import { and, asc, eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { configVersions } from '@/db/schema'
import type { ApplicationTypeBody } from '@/features/applications/applicationTypeSchema'
import { getPublished } from '@/features/config/store'
import { CUTOVER_BASE_COLUMNS } from '@/features/cutover/columns'
import type { FormBody } from '@/features/forms/formSchema'
import { err, ok, type Result } from '@/types/result'

export { CUTOVER_FEES_PAID_VALUES } from '@/features/cutover/columns'

interface PublishedType {
  key: string
  body: unknown
}

async function publishedTypes(db: DbOrTx, signal: AbortSignal): Promise<PublishedType[]> {
  signal.throwIfAborted()
  return await db
    .select({ key: configVersions.key, body: configVersions.body })
    .from(configVersions)
    .where(and(eq(configVersions.kind, 'application_type'), eq(configVersions.status, 'published')))
    .orderBy(asc(configVersions.key))
}

async function fieldKeysOfType(
  db: DbOrTx,
  type: PublishedType,
  signal: AbortSignal,
): Promise<string[]> {
  const form = await getPublished(db, 'form', (type.body as ApplicationTypeBody).formKey, signal)
  return ((form?.body as FormBody | undefined)?.fields ?? []).map((f) => f.key)
}

function matchType(types: PublishedType[], requested: string): PublishedType | undefined {
  return (
    types.find((t) => t.key === requested) ??
    types.find((t) => t.key.toLowerCase() === requested.toLowerCase())
  )
}

export async function cutoverTemplateTypes(
  db: DbOrTx,
  signal: AbortSignal,
): Promise<{ key: string; label: string }[]> {
  return (await publishedTypes(db, signal)).map((t) => ({
    key: t.key,
    label: (t.body as ApplicationTypeBody).label,
  }))
}

export async function cutoverTemplate(
  db: DbOrTx,
  requestedKey: string,
  signal: AbortSignal,
): Promise<Result<{ header: string; typeKey: string | null }, 'unknown_type'>> {
  const all = await publishedTypes(db, signal)
  const match = requestedKey === '' ? undefined : matchType(all, requestedKey)
  if (requestedKey !== '' && match === undefined) return err('unknown_type')
  const keys = new Set<string>()
  for (const type of match === undefined ? all : [match]) {
    for (const key of await fieldKeysOfType(db, type, signal)) keys.add(key)
  }
  return ok({
    header: [...CUTOVER_BASE_COLUMNS, ...[...keys].map((k) => `field.${k}`)].join(','),
    typeKey: match?.key ?? null,
  })
}
