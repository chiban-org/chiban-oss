import { eq } from 'drizzle-orm'
import type { Db, Tx } from '@/db/client'
import { applications } from '@/db/schema'

const BLOCKED_MS = 400

export interface LockOrderOutcome<T> {
  finishedWhileLocked: boolean
  rowFreeToHolder: boolean
  result: T
}

export async function runWhileApplicationLocked<T>(
  db: Db,
  applicationId: string,
  operation: () => Promise<T>,
  lockRowSkippingLocked: (tx: Tx) => Promise<unknown[]>,
): Promise<LockOrderOutcome<T>> {
  let release: () => void = () => undefined
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let locked: () => void = () => undefined
  const holding = new Promise<void>((resolve) => {
    locked = resolve
  })
  const holder = db.transaction(async (tx) => {
    await tx
      .select({ id: applications.id })
      .from(applications)
      .where(eq(applications.id, applicationId))
      .for('update')
    locked()
    await gate
    return await lockRowSkippingLocked(tx)
  })
  await holding
  let finished = false
  const running = operation().then((r) => {
    finished = true
    return r
  })
  await new Promise((resolve) => setTimeout(resolve, BLOCKED_MS))
  const finishedWhileLocked = finished
  release()
  const rows = await holder
  return { finishedWhileLocked, rowFreeToHolder: rows.length === 1, result: await running }
}
