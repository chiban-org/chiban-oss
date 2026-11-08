import { inArray } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { users } from '@/db/schema'
import { loadApplicationContext } from '@/features/applications/context'
import {
  type ItemStatus,
  itemStatus,
  stageOpenFor,
} from '@/features/applications/documentChecklist'
import {
  DOCUMENT_STAGES,
  type DocumentItem,
  type DocumentStage,
  documentItemsOf,
  documentStageLabel,
} from '@/features/applications/documentItemSchema'
import { loadItemRecords, type StoredItemRecord } from '@/features/applications/documentRecords'
import type { Actor } from '@/features/auth/actor'
import { getVersion } from '@/features/config/store'
import { listDocuments } from '@/features/documents/listDocuments'
import { describeCondition } from '@/features/forms/conditionRules'
import type { FormBody, FormField } from '@/features/forms/formSchema'

const DOCUMENT_LIMIT = 200

export interface ChecklistFile {
  documentId: string
  title: string
}

export interface ChecklistNote {
  reason: string
  by: string
  at: string
}

export interface ChecklistRow {
  key: string
  label: string
  help: string | null
  stage: DocumentStage
  status: ItemStatus
  notNeeded: string | null
  files: ChecklistFile[]
  waivable: boolean
  open: boolean
  waiver: ChecklistNote | null
  accepted: ChecklistNote | null
}

export interface ChecklistStage {
  stage: DocumentStage
  label: string
  rows: ChecklistRow[]
}

export interface DocumentChecklistView {
  applicationId: string
  stages: ChecklistStage[]
  files: ChecklistFile[]
  other: ChecklistFile[]
  missingToFile: string[]
}

async function namesOf(db: DbOrTx, records: Map<string, StoredItemRecord>) {
  const ids = [...records.values()].flatMap((r) =>
    [r.row?.acceptedBy, r.row?.waiverRequestedBy].filter(
      (id): id is string => typeof id === 'string',
    ),
  )
  if (ids.length === 0) return new Map<string, string>()
  const rows = await db
    .select({ id: users.id, name: users.displayName })
    .from(users)
    .where(inArray(users.id, [...new Set(ids)]))
  return new Map(rows.map((r) => [r.id, r.name]))
}

function note(
  reason: string | null | undefined,
  by: string | null | undefined,
  at: Date | null | undefined,
  names: Map<string, string>,
): ChecklistNote | null {
  if (at === null || at === undefined) return null
  return { reason: reason ?? '', by: names.get(by ?? '') ?? 'Unknown', at: at.toISOString() }
}

interface RowContext {
  values: Record<string, unknown>
  fields: readonly FormField[]
  records: Map<string, StoredItemRecord>
  visible: Map<string, string>
  names: Map<string, string>
  state: Parameters<typeof stageOpenFor>[1]
}

function rowOf(item: DocumentItem, ctx: RowContext): ChecklistRow {
  const record = ctx.records.get(item.key)
  const files = (record?.documentIds ?? []).flatMap((documentId) => {
    const title = ctx.visible.get(documentId)
    return title === undefined ? [] : [{ documentId, title }]
  })
  const status = itemStatus(item, ctx.values, record)
  const row = record?.row
  return {
    key: item.key,
    label: item.label,
    help: item.help ?? null,
    stage: item.stage,
    status,
    notNeeded:
      status === 'not_needed' && item.requiredIf !== undefined
        ? describeCondition(item.requiredIf, ctx.fields)
        : null,
    files,
    waivable: item.waivable,
    open: stageOpenFor(item.stage, ctx.state),
    waiver: note(row?.waiverReason, row?.waiverRequestedBy, row?.waiverRequestedAt, ctx.names),
    accepted: note(row?.acceptedReason, row?.acceptedBy, row?.acceptedAt, ctx.names),
  }
}

export async function loadDocumentChecklist(
  db: DbOrTx,
  actor: Actor,
  applicationId: string,
  signal: AbortSignal,
): Promise<DocumentChecklistView | null> {
  const app = await loadApplicationContext(db, applicationId, signal)
  if (app === null) return null
  const items = documentItemsOf(app.typeBody)
  if (items.length === 0) return null
  const [formVersion, listed, records] = await Promise.all([
    getVersion(db, app.pins.form, signal),
    listDocuments(
      db,
      actor,
      { record: { kind: 'application', id: applicationId }, limit: DOCUMENT_LIMIT },
      signal,
    ),
    loadItemRecords(db, applicationId),
  ])
  const form = formVersion?.body as FormBody | undefined
  const filed = listed.rows.filter((r) => r.docKind === 'attachment')
  const visible = new Map(filed.map((r) => [r.documentId, r.title]))
  const ctx: RowContext = {
    values: app.values,
    fields: form?.fields ?? [],
    records,
    visible,
    names: await namesOf(db, records),
    state: app.state,
  }
  const rows = items.map((item) => rowOf(item, ctx))
  const linked = new Set(rows.flatMap((r) => r.files.map((f) => f.documentId)))
  const files = filed.map((r) => ({ documentId: r.documentId, title: r.title }))
  return {
    applicationId,
    stages: DOCUMENT_STAGES.flatMap((stage) => {
      const inStage = rows.filter((r) => r.stage === stage)
      return inStage.length === 0
        ? []
        : [{ stage, label: documentStageLabel(stage), rows: inStage }]
    }),
    files,
    other: files.filter((f) => !linked.has(f.documentId)),
    missingToFile: rows
      .filter((r) => r.stage === 'to_file' && r.status === 'missing')
      .map((r) => r.label),
  }
}
