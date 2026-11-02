import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CsrfField } from '@/components/CsrfField'
import { getActor } from '@/server/getActor'
import { signOutAction } from './actions'

export default async function StaffAccountPage() {
  const actor = await getActor(AbortSignal.timeout(10_000))
  if (actor?.kind !== 'staff') redirect('/staff/sign-in')

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
