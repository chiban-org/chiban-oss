import { sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import journal from '../../drizzle/meta/_journal.json'

interface JournalEntry {
  when: number
  tag: string
}

export async function getMigrationHead(db: DbOrTx, signal: AbortSignal): Promise<string | null> {
  signal.throwIfAborted()
  const result = await db.execute<{ head: string | null }>(
    sql`select max(created_at)::text as head from drizzle.__drizzle_migrations`,
  )
  const head = result.rows[0]?.head
  if (head === null || head === undefined) return null
  const entries: JournalEntry[] = journal.entries
  return entries.find((e) => e.when === Number(head))?.tag ?? null
}
