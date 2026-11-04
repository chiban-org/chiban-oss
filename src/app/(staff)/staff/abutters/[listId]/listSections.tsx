import { ActionForm } from '@/components/ActionForm'
import { CandidateTable } from '@/components/abutters/CandidateTable'
import { RecipientTable } from '@/components/abutters/RecipientTable'
import { ParcelPicker } from '@/components/parcels/picker/ParcelPicker'
import { AreaField, SelectField, TextField } from '@/components/staff/fields'
import type { CandidateRow, ListView, RecipientView } from '@/features/abutters/listView'
import {
  attestCrossingsAction,
  correctRecipientAction,
  decideTenantAction,
  excludeCandidateAction,
  selectParcelAction,
} from '../actions'

function ExcludeControl({ listId, row }: { listId: string; row: CandidateRow }) {
  if (row.excluded) return null
  return (
    <details>
      <summary>Leave off</summary>
      <ActionForm
        action={excludeCandidateAction}
        submitLabel="Leave off the list"
        confirm={{
          title: `Leave ${row.parcelLabel} off the list?`,
          body: 'Its owner is not sent notice from this list. Your reason is kept with the list.',
          confirmLabel: 'Leave it off',
        }}
      >
        <input type="hidden" name="listId" value={listId} />
        <input type="hidden" name="parcelId" value={row.parcelId} />
        <TextField label="Reason" name="reason" required />
      </ActionForm>
    </details>
  )
}

function RecipientControls({ listId, row }: { listId: string; row: RecipientView }) {
  return (
    <div className="space-y-2">
      <details>
        <summary>Correct the name or address</summary>
        <ActionForm action={correctRecipientAction} submitLabel="Save correction">
          <input type="hidden" name="listId" value={listId} />
          <input type="hidden" name="recipientId" value={row.id} />
          <TextField label="Name" name="name" defaultValue={row.name} required />
          <TextField
            label="Mailing address"
            name="mailingAddress"
            defaultValue={row.mailingAddress ?? ''}
            required
          />
          <TextField label="Reason" name="reason" required />
        </ActionForm>
      </details>
      {row.needsDecision || row.tenantDecided ? (
        <details>
          <summary>
            {row.needsDecision ? 'Decide whether this tenant counts' : 'Change the decision'}
          </summary>
          <ActionForm action={decideTenantAction} submitLabel="Record decision">
            <input type="hidden" name="listId" value={listId} />
            <input type="hidden" name="recipientId" value={row.id} />
            <SelectField
              label="Owns manufactured housing that adjoins or is directly across"
              name="qualifies"
              options={[
                ['yes', 'Yes, send notice'],
                ['no', 'No, leave off'],
              ]}
            />
            <TextField label="Reason" name="reason" required />
          </ActionForm>
        </details>
      ) : null}
    </div>
  )
}

export function CandidatesSection({ view }: { view: ListView }) {
  return (
    <section aria-label="Parcels considered">
      <h2>Parcels considered</h2>
      <CandidateTable
        rows={view.candidates}
        {...(view.canEdit
          ? {
              renderControls: (row: CandidateRow) => (
                <ExcludeControl listId={view.listId} row={row} />
              ),
            }
          : {})}
      />
      {view.canEdit ? (
        <details>
          <summary>Add a parcel across a street or stream</summary>
          <ActionForm action={selectParcelAction} submitLabel="Add parcel" className="max-w-xl">
            <input type="hidden" name="listId" value={view.listId} />
            <ParcelPicker label="Parcel" name="parcelRef" required />
            <SelectField
              label="Across a"
              name="crossing"
              options={[
                ['street', 'Street'],
                ['stream', 'Stream'],
              ]}
            />
            <AreaField label="Why it belongs on the list" name="note" required />
          </ActionForm>
        </details>
      ) : null}
      {view.canEdit && view.attestedText === null ? (
        <ActionForm
          action={attestCrossingsAction}
          submitLabel="Confirm streets and streams were reviewed"
        >
          <input type="hidden" name="listId" value={view.listId} />
        </ActionForm>
      ) : null}
      {view.attestedText === null ? null : <p>{view.attestedText}</p>}
    </section>
  )
}

export function RecipientsSection({ view }: { view: ListView }) {
  return (
    <section aria-label="Who receives notice">
      <h2>Who receives notice</h2>
      <RecipientTable
        rows={view.recipients}
        {...(view.canEdit
          ? {
              renderControls: (row: RecipientView) => (
                <RecipientControls listId={view.listId} row={row} />
              ),
            }
          : {})}
      />
    </section>
  )
}
