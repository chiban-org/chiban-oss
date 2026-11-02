import { ActionForm } from '@/components/ActionForm'
import { SelectField, TextField } from '@/components/staff/fields'
import { loadPacketsPage } from '@/features/boards/packetsPage'
import { requireStaffContext } from '@/server/requireStaff'
import { createPacketAction, revokePacketLinkAction, sendPacketLinkAction } from './actions'

export const dynamic = 'force-dynamic'

const BOARDS: [string, string][] = [
  ['planning_board', 'Planning Board'],
  ['zba', 'Zoning Board of Adjustment'],
]

export default async function PacketsPage() {
  const ctx = await requireStaffContext()
  const page = await loadPacketsPage(ctx.db, ctx.actor, ctx.signal)
  if (!page.ok) {
    return (
      <main>
        <h1>Board packets</h1>
        <p role="alert">You do not have permission to manage board packets.</p>
      </main>
    )
  }
  const { packets, documents } = page.value
  return (
    <main className="space-y-6">
      <h1>Board packets</h1>
      <p>
        Seated board members read a packet on their board page once the meeting agenda is published.
        Sending to a seated member emails them a notice. Anyone else gets a link that expires.
      </p>
      <section aria-label="New packet">
        <h2>New packet</h2>
        <ActionForm action={createPacketAction} submitLabel="Create packet" variant="default">
          <TextField label="Title" name="title" required />
          <SelectField label="Board" name="board" options={BOARDS} />
          <TextField label="Meeting date" name="meetingDate" type="date" required />
          <fieldset className="space-y-1 border-0 p-0">
            <legend className="font-medium">Board documents shared with the board or public</legend>
            {documents.length === 0 ? (
              <p>No board documents are shared with the board yet.</p>
            ) : null}
            {documents.map((d) => (
              <label key={d.id} className="flex items-center gap-2">
                <input type="checkbox" name="documentId" value={d.id} />
                {d.label}
              </label>
            ))}
          </fieldset>
        </ActionForm>
      </section>
      {packets.map((p) => (
        <section key={p.id} aria-label={p.heading}>
          <h2>{p.heading}</h2>
          <ul className="space-y-1">
            {p.notified.map((line) => (
              <li key={line}>{line}</li>
            ))}
            {p.links.map((l) => (
              <li key={l.id}>
                {l.text}
                {l.revocable ? (
                  <ActionForm action={revokePacketLinkAction} submitLabel="Revoke link">
                    <input type="hidden" name="linkId" value={l.id} />
                  </ActionForm>
                ) : null}
              </li>
            ))}
          </ul>
          <ActionForm action={sendPacketLinkAction} submitLabel="Send link">
            <input type="hidden" name="packetId" value={p.id} />
            <TextField label="Recipient name" name="recipientName" required />
            <TextField label="Recipient email" name="recipientEmail" type="email" required />
            <TextField
              label="Days until a link expires (default 14, at most 30)"
              name="days"
              inputMode="numeric"
            />
          </ActionForm>
        </section>
      ))}
    </main>
  )
}
