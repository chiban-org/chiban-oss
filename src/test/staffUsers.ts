import { and, eq } from 'drizzle-orm'
import { AppError, ErrorIds } from '@/constants/errorIds'
import type { Role } from '@/constants/roles'
import type { Db } from '@/db/client'
import { roleCapabilities } from '@/db/schema'
import { type Actor, loadActor } from '@/features/auth/actor'
import type { MemoryMailTransport } from '@/features/mail/memoryTransport'
import { makeUser } from '@/test/factories'

const signal = new AbortController().signal

export async function actorOf(db: Db, userId: string): Promise<Actor> {
  const actor = await loadActor(db, userId, signal)
  if (actor === null) throw new AppError(ErrorIds.DB_INVARIANT, 'actor not loadable', { userId })
  return actor
}

export async function staffWith(db: Db, roles: Role[]): Promise<Actor> {
  return await actorOf(db, await makeUser(db, { roles }))
}

export async function grant(db: Db, role: Role, capability: string): Promise<void> {
  await db.insert(roleCapabilities).values({ role, capability }).onConflictDoNothing()
}

export async function revoke(db: Db, role: Role, capability: string): Promise<void> {
  await db
    .delete(roleCapabilities)
    .where(and(eq(roleCapabilities.role, role), eq(roleCapabilities.capability, capability)))
}

export function lastToken(mail: MemoryMailTransport): string {
  const text = mail.sent.at(-1)?.text ?? ''
  const match = /token=([A-Za-z0-9_-]+)/.exec(text)
  if (match?.[1] === undefined)
    throw new AppError(ErrorIds.DB_INVARIANT, 'no link in the last email')
  return match[1]
}

export const DAY_MS = 24 * 60 * 60 * 1000
