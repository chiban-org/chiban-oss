import { ActionForm } from '@/components/ActionForm'
import { CandidateTable } from '@/components/abutters/CandidateTable'
import { RecipientTable } from '@/components/abutters/RecipientTable'
import { AreaField, SelectField, TextField } from '@/components/staff/fields'
import type { CandidateRow, ListView, RecipientView } from '@/features/abutters/listView'
import { formatCents } from '@/lib/money'
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
      <ActionForm action={excludeCandidateAction} submitLabel="Leave off the list">
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
            <TextField label="Parcel ID" name="parcelRef" required />
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

export function CostSection({ view }: { view: ListView }) {
  return (
    <section aria-label="Notice cost">
      <h2>Notice cost</h2>
      <p>{`${view.mailings} ${view.mailings === 1 ? 'mailing' : 'mailings'} on this list.`}</p>
      {view.notice.lines.map((line) => (
        <p key={line.code}>
          {`${line.label}: ${formatCents(line.assessedCents)}, ${formatCents(line.dueCents)} still due.`}
        </p>
      ))}
      {view.notice.lines.length === 0 ? <p>The cost is worked out when a list is issued.</p> : null}
    </section>
  )
}

export function LabelLinks({ listId }: { listId: string }) {
  return (
    <p>
      <a href={`/staff/abutters/${listId}/labels`} className="text-action underline">
        Print mailing labels (Avery 5160)
      </a>{' '}
      <a
        href={`/staff/abutters/${listId}/labels?sheet=avery_5163`}
        className="text-action underline"
      >
        Print mailing labels (Avery 5163)
      </a>
    </p>
  )
}
