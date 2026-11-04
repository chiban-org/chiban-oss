import { ActionForm } from '@/components/ActionForm'
import { NextStep } from '@/components/layout/NextStep'
import { FactList } from '@/components/layout/PageHeader'
import { roleLabel } from '@/features/staffNav/roleLabels'
import type { UserDetail } from '@/features/users/userDetail'
import { formatInstantDate, formatInstantLong } from '@/lib/formatDate'
import { enableAction, resendInviteAction } from '../actions'

function inviteLine(detail: UserDetail, timeZone: string): string {
  const invite = detail.invite
  if (invite === null || invite.revoked) return 'No invite link is open.'
  if (invite.expired)
    return `The invite link expired ${formatInstantLong(invite.expiresAt, timeZone)}.`
  return `The invite link works until ${formatInstantLong(invite.expiresAt, timeZone)}.`
}

function Step({ detail, timeZone }: { detail: UserDetail; timeZone: string }) {
  if (detail.status === 'invited') {
    return (
      <NextStep>
        <p className="text-sm text-ink-secondary">{inviteLine(detail, timeZone)}</p>
        <ActionForm action={resendInviteAction} submitLabel="Resend invite" variant="default">
          <input type="hidden" name="userId" value={detail.id} />
        </ActionForm>
      </NextStep>
    )
  }
  if (detail.status === 'disabled') {
    return (
      <NextStep>
        {detail.disabledReason === null ? null : (
          <p className="text-sm text-ink-secondary">{`Disabled. Reason: ${detail.disabledReason}`}</p>
        )}
        <ActionForm action={enableAction} submitLabel="Re-enable account" variant="default">
          <input type="hidden" name="userId" value={detail.id} />
        </ActionForm>
      </NextStep>
    )
  }
  return null
}

export function UserRail({ detail, timeZone }: { detail: UserDetail; timeZone: string }) {
  const step = <Step detail={detail} timeZone={timeZone} />
  return (
    <>
      {detail.status === 'active' ? null : <div className="rail-card">{step}</div>}
      <div className="rail-card">
        <FactList
          stacked
          facts={[
            { label: 'Email', value: <span className="break-all">{detail.email}</span> },
            {
              label: 'Roles',
              value: detail.roles.length === 0 ? 'None' : detail.roles.map(roleLabel).join(', '),
            },
            { label: 'Authenticator', value: detail.totpEnabled ? 'On' : 'Off' },
            { label: 'Added', value: formatInstantDate(detail.createdAt, timeZone) },
          ]}
        />
      </div>
    </>
  )
}
