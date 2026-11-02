import Link from 'next/link'
import { CsrfField } from '@/components/CsrfField'
import { words } from '@/lib/words'
import { requireStaffActor } from '@/server/requireStaff'
import { signOutAction } from './actions'

export default async function StaffAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ totp?: string }>
}) {
  const { totp } = await searchParams
  const actor = await requireStaffActor(AbortSignal.timeout(10_000))

  return (
    <main className="mx-auto max-w-md p-6">
      <h1>Account</h1>
      {totp === 'enabled' ? <p role="status">Authenticator is set up.</p> : null}
      <p>Roles: {actor.roles.map((role) => words(role)).join(', ')}</p>
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
