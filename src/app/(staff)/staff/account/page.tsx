import Link from 'next/link'
import { CsrfField } from '@/components/CsrfField'
import { FactList, PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { db } from '@/db/client'
import { loadAccountSummary } from '@/features/auth/accountSummary'
import { MIN_PASSWORD_LENGTH } from '@/features/auth/createStaffUser'
import { roleLabel } from '@/features/staffNav/roleLabels'
import { requireStaffActor } from '@/server/requireStaff'
import { ChangeNameForm, ChangePasswordForm } from './AccountForms'
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
  const people =
    summary === null
      ? []
      : [
          { label: 'Name', value: summary.displayName },
          { label: 'Email', value: summary.email },
        ]

  return (
    <main>
      <PageHeader title="Account" />
      {totp === 'enabled' ? (
        <p role="status" className="mb-6">
          Authenticator is set up.
        </p>
      ) : null}
      <div className="flex max-w-xl flex-col gap-8">
        <FactList
          stacked
          facts={[
            ...people,
            {
              label: actor.roles.length === 1 ? 'Role' : 'Roles',
              value: actor.roles.map(roleLabel).join(', '),
            },
            {
              label: 'Authenticator',
              value:
                summary?.totpEnabled === true
                  ? 'Set up. Sign-in asks for its 6-digit code.'
                  : 'Not set up. Sign-in asks only for your password.',
            },
          ]}
        />
        {summary === null ? null : (
          <section aria-labelledby="account-name">
            <h2 id="account-name">Your name</h2>
            <ChangeNameForm displayName={summary.displayName} />
          </section>
        )}
        {summary?.hasPassword === true ? (
          <section aria-labelledby="account-password">
            <h2 id="account-password">Password</h2>
            <p className="text-muted-foreground">
              Changing it signs you out on every other device.
            </p>
            <ChangePasswordForm minLength={MIN_PASSWORD_LENGTH} />
          </section>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/staff/account/totp">Authenticator settings</Link>
          </Button>
          <form action={signOutAction}>
            <CsrfField />
            <Button type="submit" variant="outline">
              Sign out
            </Button>
          </form>
        </div>
      </div>
    </main>
  )
}
