import { desc, type SQL, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { ledgerEntries } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'

const SEES_ALL_ROLES = ['staff', 'admin', 'finance', 'records_custodian'] as const

export function seesWholeLedger(actor: Actor | null): boolean {
  return actor?.roles.some((r) => (SEES_ALL_ROLES as readonly string[]).includes(r)) === true
}

export function ledgerEntryVisibleTo(actor: Actor | null): SQL {
  if (actor === null) return sql`false`
  if (seesWholeLedger(actor)) return sql`true`
  return sql`(
    ${ledgerEntries.payerUserId} = ${actor.userId}
    or exists (
      select 1
      from ledger_allocations la
      join applications app on app.id = la.application_id
      join project_parties pp on pp.project_id = app.project_id
      where la.entry_id = ${ledgerEntries.id}
        and pp.user_id = ${actor.userId}
        and pp.removed_at is null
        and pp.role in ('applicant', 'owner', 'agent')
    )
  )`
}

export function ledgerEntryVisibleForApplication(actor: Actor | null, applicationId: string): SQL {
  if (actor === null) return sql`false`
  if (seesWholeLedger(actor)) return sql`true`
  return sql`(
    ${ledgerEntries.payerUserId} = ${actor.userId}
    or exists (
      select 1
      from applications app
      join project_parties pp on pp.project_id = app.project_id
      where app.id = ${applicationId}
        and pp.user_id = ${actor.userId}
        and pp.removed_at is null
        and pp.role in ('applicant', 'owner', 'agent')
    )
  )`
}

export async function listVisibleEntries(
  db: DbOrTx,
  actor: Actor | null,
  page: { limit: number },
  signal: AbortSignal,
) {
  signal.throwIfAborted()
  return await db
    .select()
    .from(ledgerEntries)
    .where(ledgerEntryVisibleTo(actor))
    .orderBy(desc(ledgerEntries.postedAt), desc(ledgerEntries.id))
    .limit(page.limit)
}
