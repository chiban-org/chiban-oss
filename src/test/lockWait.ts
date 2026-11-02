import { sql } from 'drizzle-orm'
import type { Db, Tx } from '@/db/client'

const POLL_MS = 10

export interface HeldTransaction {
  commit(): Promise<void>
}

export async function holdOpen(
  db: Db,
  work: (tx: Tx) => Promise<unknown>,
): Promise<HeldTransaction> {
  let release: () => void = () => undefined
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let ready: () => void = () => undefined
  const started = new Promise<void>((resolve) => {
    ready = resolve
  })
  const done = db.transaction(async (tx) => {
    await work(tx)
    ready()
    await gate
  })
  await Promise.race([started, done])
  return {
    commit: async () => {
      release()
      await done
    },
  }
}

async function lockWaiters(db: Db): Promise<number> {
  const result = await db.execute<{ waiting: number }>(sql`
    select count(*)::int as waiting from pg_stat_activity
    where datname = current_database() and wait_event_type = 'Lock'
  `)
  return result.rows[0]?.waiting ?? 0
}

export async function blockedOrSettled(
  db: Db,
  work: Promise<unknown>,
): Promise<'blocked' | 'settled'> {
  const outcome = { settled: false }
  work.then(
    () => {
      outcome.settled = true
    },
    () => {
      outcome.settled = true
    },
  )
  for (;;) {
    if (outcome.settled) return 'settled'
    if ((await lockWaiters(db)) > 0) return 'blocked'
    await new Promise((resolve) => setTimeout(resolve, POLL_MS))
  }
}
