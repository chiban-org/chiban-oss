import Link from 'next/link'
import { CsrfField } from '@/components/CsrfField'
import { db } from '@/db/client'
import { loadAccountSummary } from '@/features/auth/accountSummary'
import { words } from '@/lib/words'
import { requireStaffActor } from '@/server/requireStaff'
import { signOutAction } from './actions'

export default async function StaffAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ totp?: string }>
}) {
  const { totp } = await searchParams
  const signal = AbortSignal.timeout(10_000)
  const actor = await requireStaffActor(signal)
  const summary = await loadAccountSummary(db, actor.userId, signal)

  return (
    <main className="mx-auto max-w-md p-6">
      <h1>Account</h1>
      {totp === 'enabled' ? <p role="status">Authenticator is set up.</p> : null}
      {summary === null ? null : (
        <p>
          {summary.displayName}
          <br />
          {summary.email}
        </p>
      )}
      <p>Roles: {actor.roles.map((role) => words(role)).join(', ')}</p>
      <p>
        {summary?.totpEnabled === true
          ? 'An authenticator app is set up. Sign-in asks for its 6-digit code.'
          : 'No authenticator is set up. Sign-in asks only for your password.'}
      </p>
      <p>
        <Link href="/staff/account/totp">Authenticator settings</Link>
      </p>
      <form action={signOutAction}>
        <CsrfField />
        <button type="submit">Sign out</button>
      </form>
    </main>
  )
}
