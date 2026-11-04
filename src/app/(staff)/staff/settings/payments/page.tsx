import Link from 'next/link'
import { ActionForm } from '@/components/ActionForm'
import { PracticeNotice } from '@/components/PracticeNotice'
import { SettingsHeader } from '@/components/settings/SettingsHeader'
import { CheckField, SelectField, TextField } from '@/components/staff/fields'
import { NoPermission } from '@/components/staff/NoPermission'
import { convenienceExample, percentText } from '@/features/payments/feeInputs'
import { processorFormDefaults } from '@/features/payments/processorFormDefaults'
import { loadProcessorSettings } from '@/features/payments/settingsView'
import { centsToDollarInput } from '@/lib/money'
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
  if (ctx === null) return <NoPermission title="Card payments" action="change settings" />
  const result = await loadProcessorSettings(ctx.db, ctx.actor, ctx.signal)
  if (!result.ok) return <NoPermission title="Card payments" action="change payment settings" />
  const { accounts, active, settings, cloverStatus } = result.value
  const fee = settings.convenienceFee
  const current = processorFormDefaults(accounts)
  return (
    <main>
      <SettingsHeader
        title="Card payments"
        lead="The card processor account, and the convenience fee and receipt wording for every payment."
      />
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
          <PracticeNotice>
            Clover connection is not yet verified against a live merchant account.
          </PracticeNotice>
        ) : null}
        <PracticeNotice>
          The simulated processor and card reader are not connected to a live processor. They exist
          for practice and demonstrations, and no card is ever charged.
        </PracticeNotice>
        <p className="text-muted-foreground">
          {current === null
            ? 'Save an account to turn on card payments.'
            : 'The form below starts from the active account. Secrets are never shown, so enter them again whenever you save.'}
        </p>
        <ActionForm action={saveProcessorAccountAction} submitLabel="Save processor account">
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
            label="Account number at the processor"
            hint="The Stripe account ID or the Clover merchant ID, from the processor's dashboard."
            name="accountRef"
            defaultValue={current?.accountRef}
            required
          />
          <TextField
            label="Secret key"
            hint="Stripe calls it the secret key, Clover the private token."
            name="secretKey"
            type="password"
            autoComplete="off"
          />
          <TextField
            label="Webhook signing secret"
            hint="Lets Chiban check that payment updates really come from the processor."
            name="webhookSecret"
            type="password"
            autoComplete="off"
            required
          />
          <details className="rounded-md border border-hairline p-3">
            <summary className="cursor-pointer text-sm font-medium">Advanced</summary>
            <div className="mt-3 grid gap-3">
              <TextField
                label="Clover API address"
                hint="Only for Clover. Leave as it is unless Clover gives you another."
                name="apiBase"
                defaultValue={current?.apiBase}
              />
              <TextField
                label="Clover checkout address"
                hint="Only for Clover. Leave as it is unless Clover gives you another."
                name="ecommBase"
                defaultValue={current?.ecommBase}
              />
              <TextField
                label="Card reader device ID"
                hint="Printed on the counter card reader or shown in the processor's dashboard."
                name="deviceId"
                defaultValue={current?.deviceId}
              />
            </div>
          </details>
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
            label="Percent of the payment"
            name="percent"
            inputMode="decimal"
            hint="For example 2.5 adds $2.50 to a $100 payment. Enter 0 for none."
            defaultValue={percentText(fee.basisPoints)}
            required
          />
          <TextField
            label="Plus a set amount, in dollars"
            name="fixedDollars"
            inputMode="decimal"
            hint="Added to every card payment the fee applies to, for example 0.30. Enter 0 for none."
            defaultValue={centsToDollarInput(fee.fixedCents)}
            required
          />
          <p className="m-0 text-sm">{convenienceExample(fee)}</p>
          <p className="m-0 text-sm font-medium">Charge it on</p>
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
          <Link href="/staff/settings/payment_settings">Version history for payment settings</Link>
        </p>
      </section>
    </main>
  )
}
