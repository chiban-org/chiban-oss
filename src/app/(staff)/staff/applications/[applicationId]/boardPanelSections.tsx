import Link from 'next/link'
import { ActionForm } from '@/components/ActionForm'
import { ParcelPicker } from '@/components/parcels/picker/ParcelPicker'
import { AreaField, CheckField, SelectField, TextField } from '@/components/staff/fields'
import type { BoardPanelData } from '@/features/boards/panelData'
import { addProfessionalAction, generateListAction } from '../../abutters/actions'
import {
  addApplicantParcelAction,
  boardRegionalImpactAction,
  desDeterminationAction,
  terminateUnpaidAction,
} from '../../boards/actions'

export function DeterminationSection({ data }: { data: BoardPanelData }) {
  return (
    <section aria-label="Determinations" className="space-y-3">
      <h3>Regional impact and water bodies</h3>
      <p>{data.regional.summary}</p>
      {data.canDetermine ? (
        <details>
          <summary>Record the regional impact determination</summary>
          <ActionForm
            action={boardRegionalImpactAction}
            submitLabel="Record determination"
            className="max-w-md"
          >
            <input type="hidden" name="applicationId" value={data.applicationId} />
            <SelectField
              label="Determination"
              name="determination"
              options={[
                ['no', 'No regional impact'],
                ['yes', 'Regional impact'],
                ['previously_determined', 'Previously determined by another board'],
              ]}
            />
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">
                Affected municipalities, if there is regional impact
              </legend>
              {data.regional.options.map((o) => (
                <CheckField
                  key={o.key}
                  label={o.name}
                  name="municipalityKeys"
                  value={o.key}
                  defaultChecked={data.regional.chosen.includes(o.key)}
                />
              ))}
            </fieldset>
            <TextField label="Board reference, if determined earlier" name="previousBoardRef" />
          </ActionForm>
        </details>
      ) : null}
      {data.des.applies ? (
        <>
          <p>{data.des.suggestion}</p>
          {data.des.distanceText === '' ? null : <p>{data.des.distanceText}</p>}
          <p>{data.des.determinationText ?? 'The NH DES determination has not been recorded.'}</p>
          {data.canManage ? (
            <details>
              <summary>Record the NH DES determination</summary>
              <ActionForm
                action={desDeterminationAction}
                submitLabel="Record determination"
                className="max-w-md"
              >
                <input type="hidden" name="applicationId" value={data.applicationId} />
                <SelectField
                  label="Determination"
                  name="determination"
                  defaultValue={data.des.suggestedDetermination ?? ''}
                  required
                  options={[
                    ['', 'Choose a determination'],
                    ['within_500ft', 'Within the distance, send notice to NH DES'],
                    ['not_within', 'Not within the distance'],
                    ['not_applicable', 'The notice does not apply'],
                  ]}
                />
                <AreaField
                  label="Reason"
                  name="reason"
                  hint="Required when the answer differs from the map or does not apply. The map measures from the parcel, not the building site."
                />
              </ActionForm>
            </details>
          ) : null}
        </>
      ) : null}
    </section>
  )
}

export function ListSection({ data }: { data: BoardPanelData }) {
  return (
    <section aria-label="Abutter lists" className="space-y-3">
      <h3>Abutter lists</h3>
      <p>
        {data.parcels.length === 0
          ? 'No parcels are set for this application.'
          : `Parcels: ${data.parcels.join(', ')}.`}
      </p>
      {data.lists.length === 0 ? <p>No list has been drawn.</p> : null}
      <ul className="m-0 list-none p-0">
        {data.lists.map((l) =>
          data.canOpenLists ? (
            <li key={l.id}>
              <Link href={`/staff/abutters/${l.id}`}>{`Version ${l.version}`}</Link>
              {`, ${l.statusText}, drawn ${l.drawnText}`}
            </li>
          ) : (
            <li key={l.id}>{`Version ${l.version}, ${l.statusText}, drawn ${l.drawnText}`}</li>
          ),
        )}
      </ul>
      {data.canManage ? (
        <>
          <ActionForm action={generateListAction} submitLabel="Draw a new list">
            <input type="hidden" name="applicationId" value={data.applicationId} />
          </ActionForm>
          <details>
            <summary>Add a parcel to this application</summary>
            <ActionForm
              action={addApplicantParcelAction}
              submitLabel="Add parcel"
              className="max-w-md"
            >
              <input type="hidden" name="applicationId" value={data.applicationId} />
              <ParcelPicker label="Parcel" name="parcelRef" required />
            </ActionForm>
          </details>
          <details>
            <summary>Add a professional whose seal is on the plat</summary>
            <ActionForm
              action={addProfessionalAction}
              submitLabel="Add professional"
              className="max-w-md"
            >
              <input type="hidden" name="applicationId" value={data.applicationId} />
              <TextField label="Name" name="name" required />
              <SelectField
                label="Profession"
                name="profession"
                options={[
                  ['land_surveyor', 'Land surveyor'],
                  ['engineer', 'Engineer'],
                  ['architect', 'Architect'],
                  ['soil_scientist', 'Soil scientist'],
                ]}
              />
              <TextField label="Business address" name="businessAddress" required />
              <SelectField
                label="Seal is on the plat"
                name="sealOnPlat"
                options={[
                  ['yes', 'Yes, send notice'],
                  ['no', 'No'],
                ]}
              />
            </ActionForm>
          </details>
        </>
      ) : null}
      {data.professionals.length > 0 ? (
        <ul className="m-0 list-none p-0">
          {data.professionals.map((p) => (
            <li key={p.id}>{p.text}</li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

export function CostSection({ data }: { data: BoardPanelData }) {
  const { notice } = data
  const ending =
    data.canRecord && notice.dueCents > 0 && ['submitted', 'under_review'].includes(data.state)
  return (
    <section aria-label="Notice costs" className="space-y-3">
      <h3>Notice costs</h3>
      {notice.mailings === null ? (
        <p>The cost is worked out when a list is issued.</p>
      ) : (
        <p>{`${notice.mailings} ${notice.mailings === 1 ? 'mailing' : 'mailings'} on the issued list. The cost is in Fees and payments.`}</p>
      )}
      {ending ? (
        <details>
          <summary className="text-status-failed-fg">
            End this application for unpaid notice costs
          </summary>
          <ActionForm
            action={terminateUnpaidAction}
            submitLabel="End the application"
            confirm={{
              title: 'End this application for unpaid notice costs?',
              body: 'The application ends with your reason. This cannot be undone.',
              confirmLabel: 'End the application',
            }}
            variant="destructive"
            className="max-w-md"
          >
            <input type="hidden" name="applicationId" value={data.applicationId} />
            <TextField label="Reason" name="reason" required />
          </ActionForm>
        </details>
      ) : null}
    </section>
  )
}
