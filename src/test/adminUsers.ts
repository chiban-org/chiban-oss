import { randomUUID } from 'node:crypto'
import type { Db } from '@/db/client'
import { staffAccountLinks } from '@/db/schema'
import { makeUser } from '@/test/factories'

export async function makeInvitedUser(db: Db): Promise<string> {
  const userId = await makeUser(db, { role: 'staff' })
  await db.insert(staffAccountLinks).values({
    userId,
    purpose: 'invite',
    tokenHash: randomUUID(),
    expiresAt: new Date(Date.now() + 86_400_000),
  })
  return userId
}
