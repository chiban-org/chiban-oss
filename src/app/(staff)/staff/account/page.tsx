import Link from 'next/link'
import { CsrfField } from '@/components/CsrfField'
import { requireStaffActor } from '@/server/requireStaff'
import { signOutAction } from './actions'

export default async function StaffAccountPage() {
  const actor = await requireStaffActor(AbortSignal.timeout(10_000))

  return (
    <main className="mx-auto max-w-md p-6">
      <h1>Account</h1>
      <p>Roles: {actor.roles.join(', ')}</p>
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
