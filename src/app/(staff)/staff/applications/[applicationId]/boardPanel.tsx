import Link from 'next/link'
import { ActionForm } from '@/components/ActionForm'
import { AreaField, SelectField, TextField } from '@/components/staff/fields'
import type { BoardPanelData } from '@/features/boards/panelData'
import { formatCents } from '@/lib/money'
import { addProfessionalAction, generateListAction } from '../../abutters/actions'
import {
  addApplicantParcelAction,
  boardRegionalImpactAction,
  certificationAction,
  completenessVoteAction,
  desDeterminationAction,
  finalApprovalAction,
  setAcceptanceMeetingAction,
  terminateUnpaidAction,
} from '../../boards/actions'

function MeetingSelect({ data }: { data: BoardPanelData }) {
  return (
    <SelectField
      label={data.board === 'zba' ? 'Hearing meeting' : 'Meeting'}
      name="meetingId"
      options={data.meetings.map((m): [string, string] => [m.id, m.text])}
    />
  )
}

function VoteForm({ data }: { data: BoardPanelData }) {
  const planning = data.board === 'planning_board'
  return (
    <details>
      <summary>{planning ? 'Record the completeness vote' : 'Open the hearing'}</summary>
      <ActionForm action={completenessVoteAction} submitLabel="Record vote" className="max-w-md">
        <input type="hidden" name="applicationId" value={data.applicationId} />
        <MeetingSelect data={data} />
        <TextField
          label="Date of the vote"
          name="votedOn"
          type="date"
          defaultValue={data.today}
          required
        />
        <SelectField
          label="Outcome"
          name="outcome"
          options={[
            ['accepted', planning ? 'Accepted as complete' : 'Accepted for hearing'],
            ['not_accepted', planning ? 'Not accepted as complete' : 'Not accepted'],
          ]}
        />
        <TextField label="Reason, if not accepted" name="reason" />
      </ActionForm>
    </details>
  )
}

function acceptanceSummary(data: BoardPanelData): string {
  const planning = data.board === 'planning_board'
  if (data.acceptanceText === null) {
    return planning ? 'No acceptance meeting is set.' : 'No hearing meeting is set.'
  }
  return `${planning ? 'Acceptance meeting' : 'Hearing meeting'}: ${data.acceptanceText}.`
}

function AcceptanceSection({ data }: { data: BoardPanelData }) {
  const planning = data.board === 'planning_board'
  const open = data.canRecord && data.state === 'submitted'
  return (
    <section aria-label={planning ? 'Acceptance' : 'Hearing'} className="space-y-3">
      <h3>{planning ? 'Filing and acceptance' : 'Hearing'}</h3>
      <p>
        {acceptanceSummary(data)}
        {data.hasFilingLead
          ? ' The application must be filed before the deadline shown on the clocks.'
          : ''}
      </p>
      {open ? (
        <ActionForm
          action={setAcceptanceMeetingAction}
          submitLabel="Set the meeting"
          className="max-w-md"
        >
          <input type="hidden" name="applicationId" value={data.applicationId} />
          <MeetingSelect data={data} />
        </ActionForm>
      ) : null}
      {open ? <VoteForm data={data} /> : null}
    </section>
  )
}

function DeterminationSection({ data }: { data: BoardPanelData }) {
  return (
    <section aria-label="Determinations" className="space-y-3">
      <h3>Regional impact and water bodies</h3>
      <p>
        {data.regional.text ?? 'Regional impact has not been determined.'}
        {data.regional.chosen.length > 0
          ? ` Affected municipalities: ${data.regional.chosen.length}.`
          : ''}
      </p>
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
            <fieldset className="space-y-1">
              <legend className="text-sm font-medium">
                Affected municipalities, if there is regional impact
              </legend>
              {data.regional.options.map((o) => (
                <label key={o.key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="municipalityKeys"
                    value={o.key}
                    defaultChecked={data.regional.chosen.includes(o.key)}
                  />
                  {o.name}
                </label>
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
                  options={[
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

function ListSection({ data }: { data: BoardPanelData }) {
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
        {data.lists.map((l) => (
          <li key={l.id}>
            <Link href={`/staff/abutters/${l.id}`} className="text-action underline">
              {`Version ${l.version}`}
            </Link>
            {`, ${l.statusText}, drawn ${l.drawnText}`}
          </li>
        ))}
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
              <TextField label="Parcel ID" name="parcelRef" required />
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

function CostSection({ data }: { data: BoardPanelData }) {
  const { notice } = data
  return (
    <section aria-label="Notice costs" className="space-y-3">
      <h3>Notice costs</h3>
      {notice.mailings === null ? (
        <p>The cost is worked out when a list is issued.</p>
      ) : (
        <p>{`${notice.mailings} ${notice.mailings === 1 ? 'mailing' : 'mailings'} on the issued list.`}</p>
      )}
      {notice.lines.map((l) => (
        <p
          key={l.code}
        >{`${l.label}: ${formatCents(l.assessedCents)} assessed, ${formatCents(l.dueCents)} still due.`}</p>
      ))}
      {data.canRecord &&
      notice.dueCents > 0 &&
      ['submitted', 'under_review'].includes(data.state) ? (
        <details>
          <summary>End this application for unpaid notice costs</summary>
          <ActionForm
            action={terminateUnpaidAction}
            submitLabel="End the application"
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

function DecisionSection({ data }: { data: BoardPanelData }) {
  if (!data.certification.offered && data.certification.history.length === 0 && !data.hasExercise)
    return null
  return (
    <section aria-label="Decision follow-up" className="space-y-3">
      <h3>Decision follow-up</h3>
      {data.certification.history.map((line) => (
        <p key={line}>{line}</p>
      ))}
      {data.canRecord && data.certification.offered ? (
        <details>
          <summary>Record a request to the selectmen</summary>
          <ActionForm action={certificationAction} submitLabel="Record" className="max-w-md">
            <input type="hidden" name="applicationId" value={data.applicationId} />
            <TextField
              label="Date requested"
              name="requestedOn"
              type="date"
              defaultValue={data.today}
              required
            />
            <SelectField
              label="Outcome"
              name="outcome"
              options={[
                ['pending', 'Requested, waiting'],
                ['certified', 'Certified by the selectmen'],
                ['refused', 'The selectmen refused'],
              ]}
            />
            <TextField label="Date decided, if certified" name="decidedOn" type="date" />
          </ActionForm>
        </details>
      ) : null}
      {data.hasExercise ? (
        <>
          <p>
            {data.exerciseText === null
              ? 'The deadline to exercise the approval starts when final approval is recorded.'
              : `The approval must be exercised by ${data.exerciseText}.`}
          </p>
          {data.canRecord &&
          data.exerciseText === null &&
          ['decided', 'issued'].includes(data.state) ? (
            <ActionForm
              action={finalApprovalAction}
              submitLabel="Record final approval"
              className="max-w-md"
            >
              <input type="hidden" name="applicationId" value={data.applicationId} />
              <TextField
                label="Date of final approval"
                name="finalOn"
                type="date"
                defaultValue={data.today}
                required
              />
            </ActionForm>
          ) : null}
        </>
      ) : null}
    </section>
  )
}

export function BoardPanel({ data }: { data: BoardPanelData }) {
  return (
    <section aria-label="Board" className="space-y-4">
      <h2>{data.boardName}</h2>
      <AcceptanceSection data={data} />
      <DeterminationSection data={data} />
      <ListSection data={data} />
      <CostSection data={data} />
      <DecisionSection data={data} />
    </section>
  )
}
