import { ActionForm } from '@/components/ActionForm'
import { TextField } from '@/components/staff/fields'
import type { PacketSendView } from '@/features/boards/packetPanel'
import type { TrackRow } from '@/features/boards/packetTrack'
import { formatInstantDate } from '@/lib/formatDate'
import {
  resendAction,
  sendOutsideAction,
  sendToBoardAction,
  sendUpdateAction,
  turnOffLinkAction,
} from './packetActions'

export function getsText(row: TrackRow, zone: string, now: Date): string {
  if (row.gets.kind === 'member') return 'signs in on the board page'
  if (row.gets.revoked) return 'private link, turned off'
  const date = formatInstantDate(row.gets.expiresAt, zone)
  return row.gets.expiresAt.getTime() <= now.getTime()
    ? `private link, expired ${date}`
    : `private link, expires ${date}`
}

function linkIsOn(row: TrackRow, now: Date): boolean {
  return row.gets.kind === 'link' && !row.gets.revoked && row.gets.expiresAt > now
}

export function RecipientActions({
  row,
  packetId,
  now,
  turnOffOnly = false,
}: {
  row: TrackRow
  packetId: string
  now: Date
  turnOffOnly?: boolean
}) {
  const { gets } = row
  if (gets.kind === 'link' && !linkIsOn(row, now)) return null
  return (
    <div className="flex flex-wrap gap-2">
      {turnOffOnly ? null : (
        <ActionForm action={resendAction} submitLabel="Resend" compact>
          <input type="hidden" name="packetId" value={packetId} />
          {gets.kind === 'member' ? (
            <input type="hidden" name="userId" value={gets.userId} />
          ) : (
            <input type="hidden" name="linkId" value={gets.linkId} />
          )}
        </ActionForm>
      )}
      {gets.kind === 'link' ? (
        <ActionForm
          action={turnOffLinkAction}
          submitLabel="Turn off link"
          compact
          confirm={{
            title: `Turn off the packet link for ${row.name}?`,
            body: 'The link stops working at once. Resend gives them a new one.',
            confirmLabel: 'Turn off the link',
          }}
        >
          <input type="hidden" name="linkId" value={gets.linkId} />
        </ActionForm>
      ) : null}
    </div>
  )
}

function boardLabelOf(send: PacketSendView, boardName: string): string {
  if (send.membersNotSent === send.members) {
    return `Send to the ${boardName} (${send.members} members)`
  }
  return send.membersNotSent === 1
    ? 'Send to the 1 member who does not have it'
    : `Send to the ${send.membersNotSent} members who do not have it`
}

export function SendStep({
  send,
  boardName,
  recipients,
  zone,
}: {
  send: PacketSendView
  boardName: string
  recipients: TrackRow[]
  zone: string
}) {
  const now = new Date()
  return (
    <div className="flex flex-col gap-4">
      {send.membersNotSent > 0 ? (
        <ActionForm action={sendToBoardAction} submitLabel={boardLabelOf(send, boardName)}>
          <input type="hidden" name="packetId" value={send.packetId} />
        </ActionForm>
      ) : null}
      {send.sent && send.pending > 0 ? (
        <ActionForm action={sendUpdateAction} submitLabel="Send update">
          <input type="hidden" name="packetId" value={send.packetId} />
          <p className="m-0">{`Recipients get an email that lists only what changed: ${send.pendingSummary}.`}</p>
        </ActionForm>
      ) : null}
      {recipients.length === 0 ? null : (
        <ul className="m-0 list-none p-0">
          {recipients.map((row) => (
            <li
              key={row.key}
              className="record-item flex flex-wrap items-center justify-between gap-2"
            >
              <span>{`${row.name} (${row.email}): ${getsText(row, zone, now)}`}</span>
              <RecipientActions row={row} packetId={send.packetId} now={now} />
            </li>
          ))}
        </ul>
      )}
      <details>
        <summary>Also send to someone outside the board</summary>
        <ActionForm action={sendOutsideAction} submitLabel="Send the link" className="max-w-md">
          <input type="hidden" name="packetId" value={send.packetId} />
          <TextField label="Name" name="recipientName" required />
          <TextField label="Email" name="recipientEmail" type="email" required />
          <TextField
            label="Days until the link expires"
            hint="From 1 to 30. The link stops working after that."
            name="days"
            inputMode="numeric"
            defaultValue="14"
          />
        </ActionForm>
      </details>
    </div>
  )
}
