import Link from 'next/link'
import { ActionForm } from '@/components/ActionForm'
import { NextStep } from '@/components/layout/NextStep'
import { FactList } from '@/components/layout/PageHeader'
import { AreaField, SelectField } from '@/components/staff/fields'
import type { HearingView } from '@/features/hearings/views'
import { continueHearingAction, markProperlyNoticedAction } from '../actions'
import { HeldForm } from './heldForm'

function outstandingText(count: number): string {
  return count === 1 ? '1 notice still needs proof' : `${count} notices still need proof`
}

function ScheduledStep({ view, today }: { view: HearingView; today: string }) {
  const outstanding = view.checklist.filter((i) => i.state !== 'proved_on_time').length
  if (outstanding > 0 || view.checklist.length === 0) {
    return (
      <>
        <p>
          <a href="#record-proof">Record proof of notice</a>
        </p>
        {outstanding === 0 ? null : (
          <p className="text-sm text-ink-secondary">{`Before marking it noticed: ${outstandingText(outstanding)}.`}</p>
        )}
      </>
    )
  }
  if (view.noticedOn === null) {
    return (
      <ActionForm
        action={markProperlyNoticedAction}
        submitLabel="Mark properly noticed"
        variant="default"
      >
        <input type="hidden" name="hearingId" value={view.hearingId} />
      </ActionForm>
    )
  }
  return (
    <HeldForm
      hearingId={view.hearingId}
      meetingDate={view.defaultHeldOn}
      meetingText={view.meetingText}
      today={today}
    />
  )
}

function HeldStep({ view }: { view: HearingView }) {
  if (view.decision === null) {
    return (
      <p>
        <a href="#record-decision">Record the decision</a>
      </p>
    )
  }
  return (
    <p>
      {`${view.decision.text}. `}
      <Link href={`/staff/boards/decisions/${view.decision.decisionId}`}>Open the decision</Link>
    </p>
  )
}

function ContinueForm({ view }: { view: HearingView }) {
  if (view.otherMeetings.length === 0) {
    return <p className="text-sm">Add a later meeting to the calendar to continue this hearing.</p>
  }
  return (
    <details>
      <summary className="text-sm">Continue to another meeting</summary>
      <ActionForm action={continueHearingAction} submitLabel="Continue hearing">
        <input type="hidden" name="hearingId" value={view.hearingId} />
        <SelectField
          label="New meeting"
          name="toMeetingId"
          options={view.otherMeetings.map((m): [string, string] => [m.id, m.text])}
        />
        <SelectField
          label="Was the new date, time, and place announced at the meeting?"
          name="announced"
          options={[
            ['yes', 'Yes, it was announced'],
            ['no', 'No, it was not announced'],
          ]}
        />
        <AreaField
          label="What was announced"
          name="details"
          hint="Required when it was announced."
        />
      </ActionForm>
    </details>
  )
}

function hearingLink(link: NonNullable<HearingView['continuedFrom']>, words: string) {
  return (
    <Link href={`/staff/boards/hearings/${link.hearingId}`}>
      {`${words} the ${link.dateText} hearing`}
    </Link>
  )
}

function hearingFacts(view: HearingView) {
  return [
    {
      label: 'Meeting',
      value: (
        <Link href={`/staff/boards/meetings/${view.meetingId}`}>
          {`${view.boardName}, ${view.meetingText}`}
        </Link>
      ),
    },
    {
      label: 'Application',
      value: (
        <Link href={`/staff/applications/${view.applicationId}`}>
          {`${view.typeLabel} ${view.applicationNumber}`}
        </Link>
      ),
    },
    ...(view.continuedFrom === null
      ? []
      : [{ label: 'Earlier hearing', value: hearingLink(view.continuedFrom, 'Continued from') }]),
    ...(view.continuedTo === null
      ? []
      : [{ label: 'Later hearing', value: hearingLink(view.continuedTo, 'Continued to') }]),
    ...(view.announcedDetails === null
      ? []
      : [{ label: 'Announced at the meeting', value: view.announcedDetails }]),
  ]
}

export function HearingRail({ view, today }: { view: HearingView; today: string }) {
  const scheduled = view.status === 'scheduled'
  const step = scheduled ? (
    <ScheduledStep view={view} today={today} />
  ) : view.status === 'held' ? (
    <HeldStep view={view} />
  ) : null
  return (
    <>
      {step === null ? null : (
        <div className="rail-card">
          <NextStep>{step}</NextStep>
          {scheduled ? <ContinueForm view={view} /> : null}
        </div>
      )}
      <div className="rail-card">
        <FactList facts={hearingFacts(view)} stacked />
        {view.noticeRequired ? (
          <p className="text-sm">
            The continuation was not announced at the meeting, so new notice is required.
          </p>
        ) : null}
      </div>
    </>
  )
}
