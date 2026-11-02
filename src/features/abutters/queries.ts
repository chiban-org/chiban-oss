import { and, desc, eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { abutterLists } from '@/db/schema'
import type { Recipient } from '@/features/abutters/resolution'
import type { Candidate } from '@/features/abutters/types'
import type { HonestValue } from '@/features/honest/honest'

export type ListRow = typeof abutterLists.$inferSelect

export interface ListSnapshot {
  application: { id: string; number: string; typeKey: string; receivedDate: string | null }
  drawnOn: string
  strategy: { key: string; version: number; params: unknown }
  resolver: { key: string; version: number }
  layers: unknown
  candidates: Candidate[]
  recipients: Recipient[]
}

export type IssuedList = Omit<ListRow, 'snapshot'> & { snapshot: ListSnapshot }

function asIssued(row: ListRow | undefined): IssuedList | null {
  if (row === undefined || row.snapshot === null) return null
  return { ...row, snapshot: row.snapshot as ListSnapshot }
}

export async function currentIssuedList(
  db: DbOrTx,
  applicationId: string,
  signal: AbortSignal,
): Promise<IssuedList | null> {
  signal.throwIfAborted()
  const [row] = await db
    .select()
    .from(abutterLists)
    .where(and(eq(abutterLists.applicationId, applicationId), eq(abutterLists.status, 'issued')))
  return asIssued(row)
}

export async function listVersions(
  db: DbOrTx,
  applicationId: string,
  signal: AbortSignal,
): Promise<ListRow[]> {
  signal.throwIfAborted()
  return await db
    .select()
    .from(abutterLists)
    .where(eq(abutterLists.applicationId, applicationId))
    .orderBy(desc(abutterLists.version))
}

export async function getList(
  db: DbOrTx,
  listId: string,
  signal: AbortSignal,
): Promise<ListRow | null> {
  signal.throwIfAborted()
  const [row] = await db.select().from(abutterLists).where(eq(abutterLists.id, listId))
  return row ?? null
}

export async function issuedRecipientCount(
  db: DbOrTx,
  applicationId: string,
  signal: AbortSignal,
): Promise<HonestValue<number>> {
  const issued = await currentIssuedList(db, applicationId, signal)
  if (issued === null) return { state: 'unknown' }
  const mailed = new Set(
    issued.snapshot.recipients.filter((r) => r.mailingAddress !== null).map((r) => r.key),
  )
  return {
    state: 'known',
    value: mailed.size,
    asOf: issued.issuedAt?.toISOString() ?? issued.createdAt.toISOString(),
  }
}
