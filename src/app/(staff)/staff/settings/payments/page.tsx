import Link from 'next/link'
import { ActionForm } from '@/components/ActionForm'
import { CheckField, SelectField, TextField } from '@/components/staff/fields'
import { NoPermission } from '@/components/staff/NoPermission'
import { processorFormDefaults } from '@/features/payments/processorFormDefaults'
import { loadProcessorSettings } from '@/features/payments/settingsView'
import { recordStaffContext } from '@/server/requireStaff'
import { publishPaymentSettingsAction, saveProcessorAccountAction } from './actions'

export const dynamic = 'force-dynamic'

const ACTIVE_COPY = {
  ready: 'A processor account is active.',
  not_configured: 'Card payments not configured',
  unreadable: 'Processor credentials cannot be read',
} as const

export default async function PaymentSettingsPage() {
  const ctx = await recordStaffContext()
  if (ctx === null) return <NoPermission title="Payment settings" action="change settings" />
  const result = await loadProcessorSettings(ctx.db, ctx.actor, ctx.signal)
  if (!result.ok) {
    return (
      <main>
        <h1>Payment settings</h1>
        <p role="alert">You do not have permission to change payment settings.</p>
      </main>
    )
  }
  const { accounts, active, settings, cloverStatus } = result.value
  const fee = settings.convenienceFee
  const current = processorFormDefaults(accounts)
  return (
    <main>
      <h1>Payment settings</h1>
      <section aria-labelledby="processor">
        <h2 id="processor">Processor</h2>
        <p role="status">{ACTIVE_COPY[active]}</p>
        <ul>
          {accounts.map((a) => (
            <li key={a.id}>
              {`${a.processor}, ${a.mode}, account ${a.accountRef}${a.isActive ? ' (active)' : ''}. Credentials are stored encrypted and are never shown.`}
            </li>
          ))}
        </ul>
        {cloverStatus === 'stubbed' ? (
          <p role="note">Clover connection is not yet verified against a live merchant account.</p>
        ) : null}
        <p role="note">
          The simulated processor and card reader are not connected to a live processor. They exist
          for practice and demonstrations, and no card is ever charged.
        </p>
        <p className="text-muted-foreground">
          {current === null
            ? 'Save an account to turn on card payments.'
            : 'The form below starts from the active account. Secrets are never shown, so enter them again whenever you save.'}
        </p>
        <ActionForm
          action={saveProcessorAccountAction}
          submitLabel="Save processor account"
          variant="default"
        >
          <SelectField
            label="Processor"
            name="processor"
            defaultValue={current?.processor}
            options={[
              ['stripe', 'Stripe'],
              ['clover', 'Clover'],
              ['simulated', 'Simulated (practice only)'],
            ]}
          />
          <SelectField
            label="Mode"
            name="mode"
            defaultValue={current?.mode}
            options={[
              ['test', 'Test'],
              ['live', 'Live'],
            ]}
          />
          <TextField
            label="Account reference (Stripe account ID or Clover merchant ID)"
            name="accountRef"
            defaultValue={current?.accountRef}
            required
          />
          <TextField
            label="Secret key or private token"
            name="secretKey"
            type="password"
            autoComplete="off"
          />
          <TextField
            label="Webhook signing secret"
            name="webhookSecret"
            type="password"
            autoComplete="off"
            required
          />
          <TextField label="Clover API base URL" name="apiBase" defaultValue={current?.apiBase} />
          <TextField
            label="Clover checkout base URL"
            name="ecommBase"
            defaultValue={current?.ecommBase}
          />
          <TextField
            label="Card reader device ID"
            name="deviceId"
            defaultValue={current?.deviceId}
          />
        </ActionForm>
      </section>
      <section aria-labelledby="convenience-fee">
        <h2 id="convenience-fee">Convenience fee and receipts</h2>
        <p className="text-muted-foreground">
          The convenience fee is passed to the payer on card payments only. It is shown on its own
          line and is not town fee revenue.
        </p>
        <ActionForm
          action={publishPaymentSettingsAction}
          submitLabel="Publish payment settings"
          variant="default"
        >
          <TextField
            label="Basis points (100 is 1 percent)"
            name="basisPoints"
            defaultValue={fee.basisPoints}
            required
          />
          <TextField
            label="Fixed amount in cents"
            name="fixedCents"
            defaultValue={fee.fixedCents}
            required
          />
          <CheckField
            label="Online card payments"
            name="appliesOnline"
            defaultChecked={fee.appliesTo.includes('card_online')}
          />
          <CheckField
            label="Card payments at the counter"
            name="appliesPresent"
            defaultChecked={fee.appliesTo.includes('card_present')}
          />
          <TextField
            label="Checks payable to"
            name="checksPayableTo"
            defaultValue={settings.checksPayableTo}
            required
          />
          <TextField
            label="Receipt footer"
            name="receiptFooter"
            defaultValue={settings.receiptFooter}
          />
        </ActionForm>
        <p>
          <Link href="/staff/settings/payment_settings" className="text-action underline">
            Version history for payment settings
          </Link>
        </p>
      </section>
    </main>
  )
}
