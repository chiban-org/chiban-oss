import Link from 'next/link'
import { ActionForm } from '@/components/ActionForm'
import { NextStep } from '@/components/layout/NextStep'
import { FactList } from '@/components/layout/PageHeader'
import { agendaStatusText, type MeetingView } from '@/features/hearings/meetingView'
import { createMeetingPacketAction, publishAgendaAction } from '../../hearings/actions'
import { AddHearingsForm, AddItemForm } from './AgendaSection'

type StepKind = 'build' | 'publish' | 'packet' | 'packet_made'

function stepOf(view: MeetingView): StepKind | null {
  if (view.cancelled) return null
  const { agenda } = view
  if (agenda === null || agenda.items.length === 0) return 'build'
  if (agenda.status === 'draft') return 'publish'
  if (view.packetId !== null) return 'packet_made'
  return view.canManagePackets ? 'packet' : null
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
        <ActionForm action={publishAgendaAction} submitLabel="Publish the agenda" variant="default">
          <input type="hidden" name="meetingId" value={view.meetingId} />
        </ActionForm>
      )
    case 'packet':
      return (
        <ActionForm
          action={createMeetingPacketAction}
          submitLabel="Create the meeting packet"
          variant="default"
        >
          <input type="hidden" name="meetingId" value={view.meetingId} />
        </ActionForm>
      )
    case 'packet_made':
      return view.canManagePackets ? (
        <p>
          {'The meeting packet is made. '}
          <Link href="/staff/boards/packets">Send it from Board packets</Link>
        </p>
      ) : (
        <p>The meeting packet is made.</p>
      )
  }
}

function meetingFacts(view: MeetingView) {
  return [
    { label: 'Kind', value: view.kindText },
    ...(view.locationText === '' ? [] : [{ label: 'Location', value: view.locationText }]),
    {
      label: 'Agenda',
      value: view.agenda === null ? 'Not started' : agendaStatusText(view.agenda),
    },
    ...(view.cancelled
      ? [{ label: 'Cancelled', value: view.cancelReason ?? 'No reason given' }]
      : []),
  ]
}

export function MeetingRail({ view }: { view: MeetingView }) {
  const kind = stepOf(view)
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
        <FactList facts={meetingFacts(view)} stacked />
      </div>
    </>
  )
}
