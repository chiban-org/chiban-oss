import type { Db } from '@/db/client'
import type { Actor } from '@/features/auth/actor'
import type { AppContext } from '@/server/trpc/context'
import { createCaller } from '@/server/trpc/root'

export function makeTestContext(db: Db, actor: Actor | null): AppContext {
  return { db, actor, signal: new AbortController().signal }
}

export function makeTestCaller(db: Db, actor: Actor | null) {
  return createCaller(makeTestContext(db, actor))
}
