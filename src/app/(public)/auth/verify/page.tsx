import { eq } from 'drizzle-orm'
import type { Metadata } from 'next'
import { CsrfField } from '@/components/CsrfField'
import { SubmitButton } from '@/components/SubmitButton'
import { db } from '@/db/client'
import { users } from '@/db/schema'
import { peekMagicLink } from '@/features/auth/magicLink'
import { getActor } from '@/server/getActor'
import { confirmMagicLinkAction } from './actions'

export const metadata: Metadata = { title: 'Sign in' }

export const dynamic = 'force-dynamic'

interface VerifyPageProps {
  searchParams: Promise<{ token?: string }>
}

const TIMEOUT_MS = 10_000

async function signedInEmail(signal: AbortSignal): Promise<string | null> {
  const actor = await getActor(signal)
  if (actor === null) return null
  const [row] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, actor.userId))
  return row?.email ?? null
}

export default async function VerifyPage({ searchParams }: VerifyPageProps) {
  const { token = '' } = await searchParams
  const signal = AbortSignal.timeout(TIMEOUT_MS)
  const link = token === '' ? null : await peekMagicLink(db, token, signal)
  if (link === null) {
    return (
      <main className="mx-auto max-w-md p-6">
        <h1>Sign in</h1>
        <p role="alert">That link is no longer valid. Request a new one.</p>
        <a href="/sign-in" className="tap-target inline-flex items-center">
          Back to sign in
        </a>
      </main>
    )
  }
  const current = await signedInEmail(signal)
  const switching = current !== null && current !== link.email
  return (
    <main className="mx-auto max-w-md p-6">
      <h1>Sign in</h1>
      {switching ? (
        <p role="status" className="my-3 rounded-md bg-highlight px-3 py-2">
          {`You are signed in as ${current}. If you continue, this will switch accounts.`}
        </p>
      ) : null}
      <form action={confirmMagicLinkAction}>
        <CsrfField />
        <input type="hidden" name="token" value={token} />
        <SubmitButton size="lg" className="text-base">
          {`Continue as ${link.email}`}
        </SubmitButton>
      </form>
    </main>
  )
}
