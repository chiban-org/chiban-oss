import { and, eq, inArray } from 'drizzle-orm'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CsrfField } from '@/components/CsrfField'
import { SubmitButton } from '@/components/SubmitButton'
import { db } from '@/db/client'
import { users } from '@/db/schema'
import { isDemoMode } from '@/features/demo/demoMode'
import { DEMO_PERSONAS } from '@/features/demo/personas'
import { demoSignInAction } from './actions'

export const metadata: Metadata = { title: 'Try the demo' }

export const dynamic = 'force-dynamic'

export default async function DemoPage({
  searchParams,
}: {
  searchParams: Promise<{ busy?: string }>
}) {
  if (!isDemoMode()) notFound()
  const { busy } = await searchParams
  const found = await db
    .select({ email: users.email, name: users.displayName })
    .from(users)
    .where(
      and(
        inArray(
          users.email,
          DEMO_PERSONAS.map((p) => p.email),
        ),
        eq(users.isActive, true),
      ),
    )
  const names = new Map(found.map((u) => [u.email, u.name]))
  const personas = DEMO_PERSONAS.filter((p) => names.has(p.email))
  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1>Try the demo</h1>
      <p className="text-lg">
        Pick a role and look around the town as that person. Every visitor shares these accounts, so
        you may see what someone else just did.
      </p>
      {busy === undefined ? null : (
        <p role="alert">
          There have been many sign-ins from here. Wait a few minutes and try again.
        </p>
      )}
      <ul className="mt-6 flex flex-col gap-3">
        {personas.map((persona) => (
          <li key={persona.email} className="rounded-md border border-hairline p-4">
            <h2 className="m-0 text-lg">{persona.role}</h2>
            <p className="mt-1 mb-3">
              {names.get(persona.email)}. {persona.summary}
            </p>
            <form action={demoSignInAction}>
              <CsrfField />
              <input type="hidden" name="email" value={persona.email} />
              <SubmitButton>{`Continue as ${names.get(persona.email) ?? persona.role}`}</SubmitButton>
            </form>
          </li>
        ))}
      </ul>
    </main>
  )
}
