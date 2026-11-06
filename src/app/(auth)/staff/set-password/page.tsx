import type { Metadata } from 'next'
import Link from 'next/link'
import { db } from '@/db/client'
import { MIN_PASSWORD_LENGTH } from '@/features/auth/createStaffUser'
import { deadLinkCopy, setPasswordTitle } from '@/features/users/linkCopy'
import { peekStaffLink } from '@/features/users/links'
import { SetPasswordForm } from './SetPasswordForm'

export const metadata: Metadata = { title: 'Set your password' }

export const dynamic = 'force-dynamic'

const TIMEOUT_MS = 10_000

export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token = '' } = await searchParams
  const link = await peekStaffLink(db, token, AbortSignal.timeout(TIMEOUT_MS))
  if (link.state !== 'valid') {
    return (
      <main className="mx-auto max-w-md space-y-4 p-6">
        <h1>{setPasswordTitle(link.purpose)}</h1>
        <p role="alert">{deadLinkCopy(link.state, link.purpose)}</p>
        <p>
          <Link href="/staff/sign-in">Go to staff sign-in</Link>
        </p>
      </main>
    )
  }
  const invite = link.purpose === 'invite'
  return (
    <main className="mx-auto max-w-md space-y-4 p-6">
      <h1>{setPasswordTitle(link.purpose)}</h1>
      <p>
        {invite
          ? `Welcome, ${link.displayName}. Choose a password for ${link.email}. You can add an authenticator app from Account after you sign in.`
          : `Choose a new password for ${link.email}. You will sign in with it next.`}
      </p>
      <SetPasswordForm
        token={token}
        email={link.email}
        minLength={MIN_PASSWORD_LENGTH}
        submitLabel={invite ? 'Save and sign in' : 'Save new password'}
      />
    </main>
  )
}
