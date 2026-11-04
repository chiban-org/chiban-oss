import { ActionForm } from '@/components/ActionForm'
import { AreaField } from '@/components/staff/fields'
import { MAX_REASON_LENGTH } from '@/features/users/manage'
import type { UserDetail } from '@/features/users/userDetail'
import {
  disableAction,
  resetAuthenticatorAction,
  revokeInviteAction,
  sendResetAction,
} from '../actions'

function Hidden({ id }: { id: string }) {
  return <input type="hidden" name="userId" value={id} />
}

function DisableBlock({ detail }: { detail: UserDetail }) {
  if (detail.isSelf)
    return <p className="text-muted-foreground">You cannot disable your own account.</p>
  if (detail.soleAdmin) {
    return (
      <p className="text-muted-foreground">
        This is the only active administrator, so the account cannot be disabled. Make someone else
        an administrator first.
      </p>
    )
  }
  return (
    <details>
      <summary>Disable this account</summary>
      <ActionForm
        action={disableAction}
        submitLabel="Disable account"
        confirm={{
          title: `Disable ${detail.displayName}'s account?`,
          body: 'They are signed out at once and cannot sign in until an administrator re-enables the account.',
          confirmLabel: 'Disable the account',
        }}
        variant="destructive"
        className="max-w-md"
      >
        <Hidden id={detail.id} />
        <AreaField
          label="Reason"
          name="reason"
          maxLength={MAX_REASON_LENGTH}
          hint="Kept in the account history. They are signed out at once."
          required
        />
      </ActionForm>
    </details>
  )
}

function CredentialBlock({ detail }: { detail: UserDetail }) {
  const authenticator = detail.totpEnabled || detail.hasTotpSecret
  return (
    <>
      <div className="record-item space-y-2">
        <h3>Password</h3>
        <p className="text-muted-foreground">
          Email a link that lets them set a new password. It works once for 24 hours.
        </p>
        <ActionForm
          action={sendResetAction}
          submitLabel="Send password reset link"
          confirm={{
            title: `Send ${detail.displayName} a password reset link?`,
            body: 'They get an email with a link to set a new password. It works once for 24 hours.',
            confirmLabel: 'Send the link',
            tone: 'default',
          }}
        >
          <Hidden id={detail.id} />
        </ActionForm>
      </div>
      <div className="record-item space-y-2">
        <h3>Authenticator</h3>
        {authenticator ? (
          <>
            <p className="text-muted-foreground">
              Clear it if they lost their phone. They set up a new one from Account.
            </p>
            <ActionForm
              action={resetAuthenticatorAction}
              submitLabel="Reset authenticator"
              confirm={{
                title: `Reset ${detail.displayName}'s authenticator?`,
                body: 'Their current authenticator stops working. They set up a new one from Account.',
                confirmLabel: 'Reset the authenticator',
              }}
            >
              <Hidden id={detail.id} />
            </ActionForm>
          </>
        ) : (
          <p className="text-muted-foreground">Not set up. They can add one from Account.</p>
        )}
      </div>
    </>
  )
}

export function AccessPanel({ detail }: { detail: UserDetail }) {
  if (detail.status === 'disabled') return null
  return (
    <section aria-labelledby="access">
      <h2 id="access">Access</h2>
      {detail.status === 'invited' ? (
        <div className="record-item space-y-2">
          <p className="text-muted-foreground">
            Revoking stops the link from working and disables the account.
          </p>
          <ActionForm
            action={revokeInviteAction}
            submitLabel="Revoke invite"
            confirm={{
              title: `Revoke ${detail.displayName}'s invite?`,
              body: 'The invite link stops working and the account is disabled.',
              confirmLabel: 'Revoke the invite',
            }}
          >
            <Hidden id={detail.id} />
          </ActionForm>
        </div>
      ) : (
        <>
          <CredentialBlock detail={detail} />
          <div className="record-item">
            <DisableBlock detail={detail} />
          </div>
        </>
      )}
    </section>
  )
}
