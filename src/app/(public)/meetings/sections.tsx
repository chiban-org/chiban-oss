import Link from 'next/link'
import type { ReactNode } from 'react'
import { NEW_TAB } from '@/components/newTab'
import { StatusChip } from '@/components/StatusChip'
import { formatMinuteOfDay } from '@/features/hearings/labels'
import type { PublicPastMeeting, PublicUpcomingMeeting } from '@/features/hearings/publicMeetings'
import type { PublicDecision } from '@/features/hearings/publicRecords'
import { formatCivilDate, formatCivilDateWithWeekday } from '@/lib/formatDate'

const LINK = 'tap-target inline-flex items-center'

function DocLink({
  documentId,
  name,
  children,
}: {
  documentId: string
  name?: string
  children: ReactNode
}) {
  return (
    <a {...NEW_TAB} href={`/api/documents/${documentId}`} aria-label={name} className={LINK}>
      {children}
    </a>
  )
}

function meetingName(kind: string, meeting: { boardShortName: string; meetingDate: string }) {
  return `${kind}: ${meeting.boardShortName}, ${formatCivilDate(meeting.meetingDate)}`
}

function UpcomingAgenda({ meeting }: { meeting: PublicUpcomingMeeting }) {
  if (meeting.agendaDocumentId !== null) {
    return (
      <span>
        <DocLink documentId={meeting.agendaDocumentId} name={meetingName('Agenda', meeting)}>
          Agenda
        </DocLink>
      </span>
    )
  }
  if (meeting.cancelled) return null
  return <span className="text-muted-foreground">Agenda not posted yet</span>
}

function Row({ children }: { children: ReactNode }) {
  return <li className="record-item flex flex-col gap-1 pb-3">{children}</li>
}

export function UpcomingRow({ meeting }: { meeting: PublicUpcomingMeeting }) {
  const where = meeting.location === '' ? '' : `, ${meeting.location}`
  return (
    <Row>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-semibold">{meeting.boardShortName}</span>
        {meeting.cancelled ? <StatusChip status="neutral" label="Cancelled" /> : null}
      </div>
      <span>{`${formatCivilDateWithWeekday(meeting.meetingDate)} at ${formatMinuteOfDay(meeting.startsAtMinute)}${where}`}</span>
      <UpcomingAgenda meeting={meeting} />
    </Row>
  )
}

export function PastRow({ meeting }: { meeting: PublicPastMeeting }) {
  return (
    <Row>
      <span className="font-semibold">
        {`${meeting.boardShortName}, ${formatCivilDateWithWeekday(meeting.meetingDate)}`}
      </span>
      <div className="flex flex-wrap items-center gap-x-6">
        {meeting.agendaDocumentId === null ? null : (
          <DocLink documentId={meeting.agendaDocumentId} name={meetingName('Agenda', meeting)}>
            Agenda
          </DocLink>
        )}
        {meeting.minutes === null ? (
          <span className="text-muted-foreground">Minutes not approved yet</span>
        ) : (
          <DocLink documentId={meeting.minutes.documentId} name={meetingName('Minutes', meeting)}>
            {meeting.minutes.approvedOn === null
              ? 'Minutes'
              : `Minutes, approved ${formatCivilDate(meeting.minutes.approvedOn)}`}
          </DocLink>
        )}
      </div>
    </Row>
  )
}

export function DecisionRow({ decision }: { decision: PublicDecision }) {
  const { parcel } = decision
  const record = `/parcels/${parcel.id}#record-${decision.applicationId}`
  return (
    <Row>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="m-0 flex flex-wrap items-baseline gap-x-3">
          <Link href={record} className="whitespace-nowrap font-semibold">
            {decision.applicationNumber}
          </Link>
          <span>{decision.typeLabel}</span>
        </p>
        <StatusChip status={decision.outcome.chip} label={decision.outcome.label} />
      </div>
      <Link href={`/parcels/${parcel.id}`} className="self-start">
        {parcel.address ?? 'Parcel with no site address on file'}
      </Link>
      <span className="text-ink-secondary">
        {`Voted ${formatCivilDate(decision.votedOn)} by the ${decision.boardShortName}.${decision.filedOn === null ? '' : ` Notice filed ${formatCivilDate(decision.filedOn)}.`}`}
      </span>
      <div className="flex flex-wrap gap-x-6">
        {decision.decisionDocumentId === null ? null : (
          <DocLink documentId={decision.decisionDocumentId}>Notice of decision</DocLink>
        )}
        {decision.minutesDocumentId === null ? null : (
          <DocLink documentId={decision.minutesDocumentId}>Minutes</DocLink>
        )}
      </div>
    </Row>
  )
}
