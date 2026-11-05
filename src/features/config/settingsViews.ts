import { asc, eq, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { configVersions, users } from '@/db/schema'
import { FIELD_LABELS } from '@/features/config/fieldLabels'
import type { ConfigKind } from '@/features/config/kinds'
import { skeletonBody } from '@/features/config/skeletons'
import { type FieldChange, versionChanges } from '@/features/config/versionChanges'
import { loadPack } from '@/features/packs/loadPack'
import { DOCUMENT_KINDS } from '@/features/templates/kinds/documentKinds'
import { TEMPLATE_KINDS, type TemplateKind } from '@/features/templates/templateSchema'

export interface KeyRow {
  key: string
  label: string | null
  publishedVersion: number | null
  hasDraft: boolean
  documentKind?: string
}

function stringField(body: unknown, field: string): string | null {
  if (typeof body !== 'object' || body === null) return null
  const value: unknown = new Map(Object.entries(body)).get(field)
  return typeof value === 'string' && value !== '' ? value : null
}

export function labelOfBody(kind: ConfigKind, body: unknown): string | null {
  if (kind !== 'town_rule_setting') return stringField(body, 'label')
  const ruleKey = stringField(body, 'ruleKey')
  return loadPack().rules.find((r) => r.key === ruleKey)?.label ?? null
}

function isTemplateKind(value: string | null): value is TemplateKind {
  return TEMPLATE_KINDS.some((k) => k === value)
}

export function documentKindLabel(kind: ConfigKind, body: unknown): string | null {
  if (kind !== 'template') return null
  const value = stringField(body, 'kind')
  return isTemplateKind(value) ? DOCUMENT_KINDS[value].label : null
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
    const held = byKey.get(row.key) ?? {
      key: row.key,
      label: null,
      publishedVersion: null,
      hasDraft: false,
    }
    if (row.status === 'published') held.publishedVersion = row.version
    if (row.status === 'draft') held.hasDraft = true
    if (row.status !== 'superseded') {
      held.label ??= labelOfBody(kind, row.body)
      const documentKind = documentKindLabel(kind, row.body)
      if (documentKind !== null) held.documentKind ??= documentKind
    }
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
  changes?: { from: number; items: FieldChange[] }
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
  const versions = rows.map(({ v, publisher }, index) => {
    const older = rows[index + 1]
    return {
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
      ...(older === undefined
        ? {}
        : {
            changes: {
              from: older.v.version,
              items: versionChanges(older.v.body, v.body, FIELD_LABELS[kind]),
            },
          }),
    }
  })
  const draft = rows.find((r) => r.v.status === 'draft')
  const published = rows.find((r) => r.v.status === 'published')
  const body = draft?.v.body ?? published?.v.body ?? skeletonBody(kind, key)
  return { body, versions }
}
