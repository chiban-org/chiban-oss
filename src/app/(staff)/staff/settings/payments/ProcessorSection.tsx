import { ActionForm } from '@/components/ActionForm'
import { PracticeNotice } from '@/components/PracticeNotice'
import { SelectField, TextField } from '@/components/staff/fields'
import { processorFormDefaults } from '@/features/payments/processorFormDefaults'
import type { ProcessorSettingsView } from '@/features/payments/settingsView'
import { saveProcessorAccountAction } from './actions'

const ACTIVE_COPY = {
  ready: 'A processor account is active.',
  not_configured: 'Card payments not configured',
  unreadable: 'Processor credentials cannot be read',
} as const

export function ProcessorSection({
  accounts,
  active,
  cloverStatus,
}: Pick<ProcessorSettingsView, 'accounts' | 'active' | 'cloverStatus'>) {
  const current = processorFormDefaults(accounts)
  return (
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
  )
}
