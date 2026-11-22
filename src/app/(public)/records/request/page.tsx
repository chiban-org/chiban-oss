import { eq } from 'drizzle-orm'
import type { Metadata } from 'next'
import { db } from '@/db/client'
import { users } from '@/db/schema'
import { portalActorOrNull } from '@/server/requirePortal'
import { RecordsRequestForm } from './RecordsRequestForm'

export const metadata: Metadata = { title: 'Ask for town records' }

const SESSION_TIMEOUT_MS = 15_000

async function signedInEmail(): Promise<string | null> {
  const signal = AbortSignal.timeout(SESSION_TIMEOUT_MS)
  const actor = await portalActorOrNull(signal)
  if (actor?.kind !== 'public') return null
  const [user] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, actor.userId))
    .limit(1)
  return user?.email ?? null
}

export default async function RecordsRequestPage() {
  const email = await signedInEmail()
  return (
    <main>
      <h1>Ask for town records</h1>
      <p className="max-w-prose">
        Anyone can ask to see or get copies of the public records the town keeps. You do not need an
        account. Tell the town what you are looking for and where to send the answer.
      </p>
      <RecordsRequestForm email={email} />
    </main>
  )
}
