import type { ReactNode } from 'react'
import { ActionForm } from '@/components/ActionForm'
import { TextField } from '@/components/staff/fields'
import type { PacketPanel } from '@/features/boards/packetPanel'
import type { TrackRow } from '@/features/boards/packetTrack'
import { formatInstant } from '@/lib/formatDate'
import { GatherStep } from './PacketGather'
import { SendStep } from './PacketSend'
import { renamePacketAction, replaceAgendaAction } from './packetActions'

function Step({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id}>
      <h3 id={id}>{title}</h3>
      {children}
    </section>
  )
}

function Muted({ children }: { children: ReactNode }) {
  return <p className="m-0 text-muted-foreground">{children}</p>
}

function ReviewStep({ panel }: { panel: PacketPanel }) {
  const { review } = panel
  if (review === null) return <Muted>Save the gathered documents to review the packet.</Muted>
  return (
    <div className="flex flex-col gap-4">
      {panel.agendaChanged ? (
        <ActionForm action={replaceAgendaAction} submitLabel="Replace the agenda">
          <input type="hidden" name="meetingId" value={panel.meetingId} />
          <p className="m-0">
            <span className="bg-highlight">The agenda changed.</span> Replace it in the packet?
          </p>
        </ActionForm>
      ) : null}
      <ol className="m-0 space-y-1 pl-6">
        {review.lines.map((line) => (
          <li key={line.documentId}>
            {line.title}
            {line.note === null ? null : (
              <span className="text-sm text-muted-foreground">{` (${line.note})`}</span>
            )}
          </li>
        ))}
      </ol>
      <p className="m-0">
        <a
          href={`/staff/boards/meetings/${panel.meetingId}/packet/cover`}
          target="_blank"
          rel="noreferrer"
        >
          Preview the cover page
        </a>
      </p>
      <ActionForm action={renamePacketAction} submitLabel="Save title" className="max-w-md">
        <input type="hidden" name="packetId" value={review.packetId} />
        <TextField label="Title" name="title" defaultValue={review.title} required />
      </ActionForm>
    </div>
  )
}

function when(at: Date | null, zone: string): ReactNode {
  return at === null ? (
    <span className="text-muted-foreground">Not yet</span>
  ) : (
    formatInstant(at, zone)
  )
}

function TrackStep({ rows, zone }: { rows: TrackRow[]; zone: string }) {
  if (rows.length === 0) return <Muted>Reads show here once the packet is sent.</Muted>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">Who has read the packet</caption>
        <thead>
          <tr>
            <th scope="col">Recipient</th>
            <th scope="col">Last sent</th>
            <th scope="col">First opened</th>
            <th scope="col">Last opened</th>
            <th scope="col">Documents opened</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td>{row.name}</td>
              <td>{formatInstant(row.sentAt, zone)}</td>
              <td>{when(row.firstOpenedAt, zone)}</td>
              <td>{when(row.lastOpenedAt, zone)}</td>
              <td>{row.documentsOpened}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Steps({ panel }: { panel: PacketPanel }) {
  return (
    <>
      <Step id="packet-gather" title="Gather">
        {panel.gather === null ? null : (
          <GatherStep gather={panel.gather} canShare={panel.canShare} />
        )}
      </Step>
      <Step id="packet-review" title="Review">
        <ReviewStep panel={panel} />
      </Step>
      <Step id="packet-send" title="Send">
        {panel.send === null ? (
          <Muted>Save the packet to send it.</Muted>
        ) : (
          <SendStep
            send={panel.send}
            boardName={panel.boardName}
            recipients={panel.recipients}
            zone={panel.zone}
          />
        )}
      </Step>
      <Step id="packet-track" title="Track">
        <TrackStep rows={panel.recipients} zone={panel.zone} />
      </Step>
    </>
  )
}

export function PacketSection({ panel }: { panel: PacketPanel }) {
  const open = panel.gather !== null
  return (
    <section id="packet" aria-labelledby="packet-heading">
      <h2 id="packet-heading">Packet</h2>
      <p>{panel.state.label}</p>
      {open ? <Steps panel={panel} /> : null}
    </section>
  )
}
