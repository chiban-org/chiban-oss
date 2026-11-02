import { asc, eq, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { configVersions, users } from '@/db/schema'
import { CONFIG_KINDS, type ConfigKind } from '@/features/config/kinds'
import { skeletonBody } from '@/features/config/skeletons'

export interface KindSummary {
  kind: ConfigKind
  keys: number
}

export async function summarizeKinds(db: DbOrTx, signal: AbortSignal): Promise<KindSummary[]> {
  signal.throwIfAborted()
  const rows = await db
    .select({
      kind: configVersions.kind,
      keys: sql<number>`count(distinct ${configVersions.key})::int`,
    })
    .from(configVersions)
    .groupBy(configVersions.kind)
  const counts = new Map(rows.map((r) => [r.kind, r.keys]))
  return CONFIG_KINDS.map((kind) => ({ kind, keys: counts.get(kind) ?? 0 }))
}

export interface KeyRow {
  key: string
  publishedVersion: number | null
  hasDraft: boolean
}

export async function listKeysOfKind(
  db: DbOrTx,
  kind: ConfigKind,
  signal: AbortSignal,
): Promise<KeyRow[]> {
  signal.throwIfAborted()
  const rows = await db
    .select()
    .from(configVersions)
    .where(eq(configVersions.kind, kind))
    .orderBy(asc(configVersions.key), asc(configVersions.version))
  const byKey = new Map<string, KeyRow>()
  for (const row of rows) {
    const held = byKey.get(row.key) ?? { key: row.key, publishedVersion: null, hasDraft: false }
    if (row.status === 'published') held.publishedVersion = row.version
    if (row.status === 'draft') held.hasDraft = true
    byKey.set(row.key, held)
  }
  return [...byKey.values()]
}

export interface VersionRowView {
  id: string
  version: number
  status: 'draft' | 'published' | 'superseded'
  publishedBy: string | null
  publishedAt: Date | null
  upstream: { id: string; version: number } | null
  rolledBackFrom: number | null
}

export interface EditorState {
  body: unknown
  versions: VersionRowView[]
}

export async function getEditorState(
  db: DbOrTx,
  kind: ConfigKind,
  key: string,
  signal: AbortSignal,
): Promise<EditorState> {
  signal.throwIfAborted()
  const rows = await db
    .select({ v: configVersions, publisher: users.displayName })
    .from(configVersions)
    .leftJoin(users, eq(users.id, configVersions.publishedBy))
    .where(sql`${configVersions.kind} = ${kind} and ${configVersions.key} = ${key}`)
    .orderBy(sql`${configVersions.version} desc`)
  const versions = rows.map(({ v, publisher }) => ({
    id: v.id,
    version: v.version,
    status: v.status,
    publishedBy: publisher,
    publishedAt: v.publishedAt,
    upstream:
      v.upstreamTemplateId === null || v.upstreamTemplateVersion === null
        ? null
        : { id: v.upstreamTemplateId, version: v.upstreamTemplateVersion },
    rolledBackFrom: v.rolledBackFrom,
  }))
  const draft = rows.find((r) => r.v.status === 'draft')
  const published = rows.find((r) => r.v.status === 'published')
  const body = draft?.v.body ?? published?.v.body ?? skeletonBody(kind, key)
  return { body, versions }
}
