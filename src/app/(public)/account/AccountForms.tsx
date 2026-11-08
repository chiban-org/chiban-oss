import { ActionForm } from '@/components/ActionForm'
import { AreaField, CheckField, TextField } from '@/components/staff/fields'
import type { AccountView } from '@/features/contractors/accountView'
import { licenseFieldName } from '@/features/contractors/profileForm'
import { CONTRACTOR_TRADES } from '@/features/contractors/trades'
import { saveContractorAction, savePersonAction } from './profileActions'

function PersonFields({ view, nameLabel }: { view: AccountView; nameLabel: string }) {
  return (
    <>
      <TextField
        label={nameLabel}
        name="name"
        autoComplete="name"
        required
        defaultValue={view.name}
      />
      <TextField
        label="Email address"
        name="email"
        type="email"
        value={view.email}
        readOnly
        disabled
      />
    </>
  )
}

export function PersonForm({ view }: { view: AccountView }) {
  return (
    <ActionForm action={savePersonAction} submitLabel="Save your details">
      <PersonFields view={view} nameLabel="Your name" />
      <TextField
        label="Phone"
        name="phone"
        type="tel"
        autoComplete="tel"
        defaultValue={view.phone ?? ''}
      />
      <AreaField
        label="Mailing address"
        name="mailingAddress"
        rows={3}
        autoComplete="street-address"
        defaultValue={view.mailingAddress ?? ''}
      />
    </ActionForm>
  )
}

function licenseNumber(view: AccountView, trade: string): string {
  return view.contractor?.licenses.find((l) => l.trade === trade)?.number ?? ''
}

export function ContractorForm({ view }: { view: AccountView }) {
  const trades = view.contractor?.trades ?? []
  return (
    <ActionForm
      action={saveContractorAction}
      submitLabel={
        view.contractor === null ? 'Set up the contractor profile' : 'Save the contractor profile'
      }
    >
      <TextField
        label="Company name"
        name="companyName"
        autoComplete="organization"
        required
        defaultValue={view.contractor?.companyName ?? ''}
      />
      <PersonFields view={view} nameLabel="Contact name" />
      <TextField
        label="Phone"
        name="phone"
        type="tel"
        autoComplete="tel"
        required
        defaultValue={view.phone ?? ''}
      />
      <AreaField
        label="Mailing address"
        name="mailingAddress"
        rows={3}
        autoComplete="street-address"
        defaultValue={view.mailingAddress ?? ''}
      />
      <fieldset className="space-y-2 border-0 p-0">
        <legend className="text-sm font-medium">Trades</legend>
        <p className="text-sm text-muted-foreground">
          Choose the licensed trades you work in. Leave them all clear if you do general building
          work.
        </p>
        {CONTRACTOR_TRADES.map((t) => (
          <CheckField
            key={t.trade}
            label={t.label}
            name="trades"
            value={t.trade}
            defaultChecked={trades.includes(t.trade)}
            groupMember
          />
        ))}
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        {CONTRACTOR_TRADES.map((t) => (
          <TextField
            key={t.trade}
            label={`NH license number, ${t.label.toLowerCase()}`}
            name={licenseFieldName(t.trade)}
            autoComplete="off"
            defaultValue={licenseNumber(view, t.trade)}
          />
        ))}
      </div>
    </ActionForm>
  )
}
