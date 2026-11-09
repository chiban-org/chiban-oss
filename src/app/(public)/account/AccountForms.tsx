import { ActionForm } from '@/components/ActionForm'
import { AreaField, TextField } from '@/components/staff/fields'
import type { AccountView } from '@/features/contractors/accountView'
import { saveContractorAction, savePersonAction } from './profileActions'
import { TradeFields } from './TradeFields'

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
        hint="This is the email you signed in with. It cannot be changed here. To use another address, sign in with that one."
        readOnly
        disabled
      />
    </>
  )
}

export function PersonForm({ view }: { view: AccountView }) {
  return (
    <ActionForm action={savePersonAction} submitLabel="Save your details" variant="default">
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

export function ContractorForm({ view }: { view: AccountView }) {
  const trades = view.contractor?.trades ?? []
  return (
    <ActionForm
      action={saveContractorAction}
      variant="default"
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
      <TradeFields
        trades={trades}
        licenses={
          view.contractor?.licenses.map((l) => ({ trade: l.trade, number: l.number })) ?? []
        }
      />
    </ActionForm>
  )
}
