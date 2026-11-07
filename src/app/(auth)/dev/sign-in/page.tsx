import { and, eq, like } from 'drizzle-orm'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CsrfField } from '@/components/CsrfField'
import { SubmitButton } from '@/components/SubmitButton'
import { db } from '@/db/client'
import { userRoles, users } from '@/db/schema'
import { isDevSignInEnabled } from '@/features/auth/devSignIn'
import { devSignInEntries } from '@/features/auth/devSignInEntries'
import { DEMO_DOMAIN } from '@/features/demo/seedDemo'
import { devSignInAction } from './actions'

export const metadata: Metadata = { title: 'Dev sign-in' }

export const dynamic = 'force-dynamic'

export default async function DevSignInPage() {
  if (!isDevSignInEnabled()) notFound()
  const found = await db
    .select({ email: users.email, name: users.displayName, kind: users.kind, role: userRoles.role })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(and(like(users.email, `%@${DEMO_DOMAIN}`), eq(users.isActive, true)))
    .orderBy(users.email)
  const rows = devSignInEntries(found)

  return (
    <main className="mx-auto max-w-md p-6">
      <h1>Dev sign-in</h1>
      <p>
        Anonymous complaint intake is off in the demo. It turns on only after the retention check
        passes on a real deployment, from Settings, Administration, Anonymous intake.
      </p>
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li key={row.email}>
            <form action={devSignInAction}>
              <CsrfField />
              <input type="hidden" name="email" value={row.email} />
              <input type="hidden" name="kind" value={row.kind} />
              <SubmitButton variant="outline">
                {row.name} ({row.roles})
              </SubmitButton>
            </form>
          </li>
        ))}
      </ul>
    </main>
  )
}
