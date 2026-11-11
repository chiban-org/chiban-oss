import { ActionForm } from '@/components/ActionForm'
import { NextStep } from '@/components/layout/NextStep'
import { FactList } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { type MeetingMinutesView, minutesStatusText } from '@/features/boards/minutesView'
import { formatMinuteOfDay } from '@/features/hearings/labels'
import { agendaStatusText, type MeetingView } from '@/features/hearings/meetingView'
import { publishAgendaAction } from '../../hearings/actions'
import { AddHearingsForm, AddItemForm } from './AgendaSection'
import { EditMeeting } from './EditMeeting'

export type PacketStep = 'prepare' | 'update' | null

type StepKind = 'build' | 'publish' | 'prepare' | 'update' | 'minutes'

const PACKET_LABELS = { prepare: 'Prepare the packet', update: 'Send the packet update' } as const

function stepOf(
  view: MeetingView,
  packetStep: PacketStep,
  minutes: MeetingMinutesView | null,
): StepKind | null {
  if (view.cancelled) return null
  if (view.past)
    return minutes !== null && minutes.current?.status !== 'approved' ? 'minutes' : null
  const { agenda } = view
  if (agenda === null || agenda.items.length === 0) return 'build'
  if (agenda.status === 'draft') return 'publish'
  return view.canManagePackets ? packetStep : null
}

function Step({ view, kind }: { view: MeetingView; kind: StepKind }) {
  switch (kind) {
    case 'build':
      return view.hearings.length > 0 ? (
        <AddHearingsForm meetingId={view.meetingId} variant="default" />
      ) : (
        <AddItemForm
          meetingId={view.meetingId}
          submitLabel="Add the first agenda item"
          variant="default"
        />
      )
    case 'publish':
      return (
        <ActionForm
          action={publishAgendaAction}
          submitLabel="Show the agenda on the public site"
          variant="default"
        >
          <input type="hidden" name="meetingId" value={view.meetingId} />
          <p className="m-0">
            Once shown, the agenda appears on the board page and the meetings page of the public
            site.
          </p>
        </ActionForm>
      )
    case 'prepare':
    case 'update':
      return (
        <Button asChild className="no-underline">
          <a href="#packet">{kind === 'prepare' ? PACKET_LABELS.prepare : PACKET_LABELS.update}</a>
        </Button>
      )
    case 'minutes':
      return (
        <Button asChild className="no-underline">
          <a href="#minutes">Record the minutes</a>
        </Button>
      )
  }
}

function meetingFacts(
  view: MeetingView,
  packetLabel: string | null,
  minutes: MeetingMinutesView | null,
  startsAtMinute: number | null,
) {
  const minutesText = minutes === null ? null : minutesStatusText(minutes)
  return [
    ...(startsAtMinute === null
      ? []
      : [{ label: 'Time', value: formatMinuteOfDay(startsAtMinute) }]),
    { label: 'Kind', value: view.kindText },
    ...(view.locationText === '' ? [] : [{ label: 'Location', value: view.locationText }]),
    {
      label: 'Agenda',
      value: view.agenda === null ? 'Not started' : agendaStatusText(view.agenda),
    },
    ...(packetLabel === null ? [] : [{ label: 'Packet', value: packetLabel }]),
    ...(minutesText === null ? [] : [{ label: 'Minutes', value: minutesText }]),
    ...(view.cancelled
      ? [{ label: 'Cancelled', value: view.cancelReason ?? 'No reason given' }]
      : []),
  ]
}

export function MeetingRail({
  view,
  packetStep = null,
  packetLabel = null,
  minutes = null,
  startsAtMinute = null,
}: {
  view: MeetingView
  packetStep?: PacketStep
  packetLabel?: string | null
  minutes?: MeetingMinutesView | null
  startsAtMinute?: number | null
}) {
  const editable = startsAtMinute !== null && !view.cancelled && !view.past
  const kind = stepOf(view, packetStep, minutes)
  return (
    <>
      {kind === null ? null : (
        <div className="rail-card">
          <NextStep>
            <Step view={view} kind={kind} />
          </NextStep>
        </div>
      )}
      <div className="rail-card">
        <FactList facts={meetingFacts(view, packetLabel, minutes, startsAtMinute)} stacked />
        {editable ? (
          <EditMeeting
            meetingId={view.meetingId}
            startsAtMinute={startsAtMinute}
            location={view.locationText}
          />
        ) : null}
      </div>
    </>
  )
}
