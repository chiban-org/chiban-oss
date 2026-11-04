import { and, asc, eq, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { configVersions } from '@/db/schema'
import { getVersion } from '@/features/config/store'
import { defaultTemplateKey } from '@/features/templates/kinds/documentKinds'
import type { TemplateBody, TemplateKind } from '@/features/templates/templateSchema'

export async function pinnedTemplate(
  db: DbOrTx,
  versionIds: readonly string[],
  kind: TemplateKind,
  signal: AbortSignal,
): Promise<TemplateBody | null> {
  for (const id of versionIds) {
    const version = await getVersion(db, id, signal)
    const body = version?.body as TemplateBody | undefined
    if (body?.kind === kind) return body
  }
  return null
}

export async function publishedTemplate(
  db: DbOrTx,
  kind: TemplateKind,
  signal: AbortSignal,
): Promise<TemplateBody | null> {
  signal.throwIfAborted()
  const rows = await db
    .select({ key: configVersions.key, body: configVersions.body })
    .from(configVersions)
    .where(
      and(
        eq(configVersions.kind, 'template'),
        eq(configVersions.status, 'published'),
        sql`${configVersions.body}->>'kind' = ${kind}`,
      ),
    )
    .orderBy(asc(configVersions.key))
  const preferred = rows.find((r) => r.key === defaultTemplateKey(kind)) ?? rows[0]
  return (preferred?.body as TemplateBody | undefined) ?? null
}

export async function townTemplate(
  db: DbOrTx,
  kind: TemplateKind,
  pinned: readonly string[],
  signal: AbortSignal,
): Promise<TemplateBody | null> {
  return (
    (await pinnedTemplate(db, pinned, kind, signal)) ?? (await publishedTemplate(db, kind, signal))
  )
}
