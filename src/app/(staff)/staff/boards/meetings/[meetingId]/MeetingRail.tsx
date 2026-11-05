import { ActionForm } from '@/components/ActionForm'
import { NextStep } from '@/components/layout/NextStep'
import { FactList } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { agendaStatusText, type MeetingView } from '@/features/hearings/meetingView'
import { publishAgendaAction } from '../../hearings/actions'
import { AddHearingsForm, AddItemForm } from './AgendaSection'

export type PacketStep = 'prepare' | 'update' | null

type StepKind = 'build' | 'publish' | 'prepare' | 'update'

const PACKET_LABELS = { prepare: 'Prepare the packet', update: 'Send the packet update' } as const

function stepOf(view: MeetingView, packetStep: PacketStep): StepKind | null {
  if (view.cancelled || view.past) return null
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
        <ActionForm action={publishAgendaAction} submitLabel="Publish the agenda" variant="default">
          <input type="hidden" name="meetingId" value={view.meetingId} />
        </ActionForm>
      )
    case 'prepare':
    case 'update':
      return (
        <Button asChild className="no-underline">
          <a href="#packet">{PACKET_LABELS[kind]}</a>
        </Button>
      )
  }
}

function meetingFacts(view: MeetingView, packetLabel: string | null) {
  return [
    { label: 'Kind', value: view.kindText },
    ...(view.locationText === '' ? [] : [{ label: 'Location', value: view.locationText }]),
    {
      label: 'Agenda',
      value: view.agenda === null ? 'Not started' : agendaStatusText(view.agenda),
    },
    ...(packetLabel === null ? [] : [{ label: 'Packet', value: packetLabel }]),
    ...(view.cancelled
      ? [{ label: 'Cancelled', value: view.cancelReason ?? 'No reason given' }]
      : []),
  ]
}

export function MeetingRail({
  view,
  packetStep = null,
  packetLabel = null,
}: {
  view: MeetingView
  packetStep?: PacketStep
  packetLabel?: string | null
}) {
  const kind = stepOf(view, packetStep)
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
        <FactList facts={meetingFacts(view, packetLabel)} stacked />
      </div>
    </>
  )
}
