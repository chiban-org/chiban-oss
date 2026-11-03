import { eq } from 'drizzle-orm'
import type { Tx } from '@/db/client'
import { applications } from '@/db/schema'
import { type CoreState, TERMINAL_STATES } from './states'

export async function lockApplication(tx: Tx, applicationId: string): Promise<CoreState | null> {
  const [row] = await tx
    .select({ state: applications.state })
    .from(applications)
    .where(eq(applications.id, applicationId))
    .for('update')
  return row === undefined ? null : (row.state as CoreState)
}

export async function lockedAndFinished(tx: Tx, applicationId: string): Promise<boolean> {
  const state = await lockApplication(tx, applicationId)
  return state !== null && TERMINAL_STATES.includes(state)
}
