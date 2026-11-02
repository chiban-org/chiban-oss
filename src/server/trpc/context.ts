import { cache } from 'react'
import { type Db, db } from '@/db/client'
import type { Actor } from '@/features/auth/actor'
import { getActor } from '@/server/getActor'

export interface AppContext {
  db: Db
  actor: Actor | null
  signal: AbortSignal
}

const CONTEXT_TIMEOUT_MS = 10_000

export const createContext = cache(async (): Promise<AppContext> => {
  const signal = AbortSignal.timeout(CONTEXT_TIMEOUT_MS)
  const actor = await getActor(signal)
  return { db, actor, signal }
})
