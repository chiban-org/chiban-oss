import type { DbOrTx } from '@/db/client'
import { hasCapability } from '@/features/authz/capabilities'

export async function mayManageAbutters(
  db: DbOrTx,
  userId: string,
  signal: AbortSignal,
): Promise<boolean> {
  return await hasCapability(db, userId, 'abutters.manage', signal)
}

export function nonEmpty(value: string): boolean {
  return value.trim() !== ''
}
