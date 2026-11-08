import { and, eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { documents } from '@/db/schema'
import { hasFullRecordAccess } from '@/features/access/roles'
import { type ApplicationContext, loadApplicationContext } from '@/features/applications/context'
import { stageOpenFor } from '@/features/applications/documentChecklist'
import { type DocumentItem, documentItemsOf } from '@/features/applications/documentItemSchema'
import { isTerminalState } from '@/features/applications/states'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { documentVisibleTo } from '@/features/documents/visibility'
import { isActiveParty } from '@/features/projects/access'
import { err, ok, type Result } from '@/types/result'

export type ItemError =
  | 'not_found'
  | 'forbidden'
  | 'unknown_item'
  | 'stage_closed'
  | 'not_waivable'
  | 'document_not_found'

export type ItemRole = 'applicant' | 'staff_files' | 'staff_accepts'

export interface ItemTarget {
  app: ApplicationContext
  item: DocumentItem
}

async function roleAllowed(
  db: DbOrTx,
  actor: Actor,
  target: ItemTarget & { role: ItemRole },
  signal: AbortSignal,
): Promise<ItemError | null> {
  const { role } = target
  if (role === 'staff_accepts') {
    return (await hasCapability(db, actor.userId, 'application.manage', signal))
      ? null
      : 'forbidden'
  }
  if (role === 'staff_files') {
    return (await hasCapability(db, actor.userId, 'document.manage', signal)) ? null : 'forbidden'
  }
  if (hasFullRecordAccess(actor) || !(await isActiveParty(db, actor.userId, target.app.projectId)))
    return 'forbidden'
  return stageOpenFor(target.item.stage, target.app.state) ? null : 'stage_closed'
}

export async function itemTarget(
  db: DbOrTx,
  actor: Actor,
  input: { applicationId: string; itemKey: string; role: ItemRole },
  signal: AbortSignal,
): Promise<Result<ItemTarget, ItemError>> {
  const app = await loadApplicationContext(db, input.applicationId, signal)
  if (app === null) return err('not_found')
  const item = documentItemsOf(app.typeBody).find((i) => i.key === input.itemKey)
  if (item === undefined) return err('unknown_item')
  if (isTerminalState(app.state)) return err('stage_closed')
  const refused = await roleAllowed(db, actor, { app, item, role: input.role }, signal)
  return refused === null ? ok({ app, item }) : err(refused)
}

export async function documentOnApplication(
  db: DbOrTx,
  actor: Actor,
  applicationId: string,
  documentId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: documents.id })
    .from(documents)
    .where(
      and(
        eq(documents.id, documentId),
        eq(documents.recordKind, 'application'),
        eq(documents.recordId, applicationId),
        documentVisibleTo(actor),
      ),
    )
  return rows.length > 0
}
