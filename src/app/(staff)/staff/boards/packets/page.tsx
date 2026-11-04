import Link from 'next/link'
import { ActionForm } from '@/components/ActionForm'
import { CheckField, SelectField, TextField } from '@/components/staff/fields'
import { NoPermission } from '@/components/staff/NoPermission'
import { loadPacketsPage, type PacketsPageView } from '@/features/boards/packetsPage'
import { requireStaffContext } from '@/server/requireStaff'
import { createPacketAction, revokePacketLinkAction, sendPacketLinkAction } from './actions'

export const dynamic = 'force-dynamic'

function NewPacket({ meetings, documents }: Pick<PacketsPageView, 'meetings' | 'documents'>) {
  return (
    <details>
      <summary>New packet</summary>
      {meetings.length === 0 ? (
        <p>
          {'Every scheduled meeting already has a packet. '}
          <Link href="/staff/boards/meetings">Add the next meeting</Link>
          {' to make a packet for it.'}
        </p>
      ) : (
        <ActionForm action={createPacketAction} submitLabel="Create packet">
          <TextField label="Title" name="title" required />
          <SelectField
            label="Meeting"
            name="meetingId"
            options={meetings.map((m) => [m.id, m.label] as const)}
          />
          <fieldset className="space-y-1 border-0 p-0">
            <legend className="font-medium">Board documents shared with the board or public</legend>
            {documents.length === 0 ? (
              <p>No board documents are shared with the board yet.</p>
            ) : null}
            {documents.map((d) => (
              <CheckField key={d.id} label={d.label} name="documentId" value={d.id} />
            ))}
          </fieldset>
        </ActionForm>
      )}
    </details>
  )
}

export default async function PacketsPage() {
  const ctx = await requireStaffContext()
  const page = await loadPacketsPage(ctx.db, ctx.actor, ctx.signal)
  if (!page.ok) return <NoPermission title="Board packets" action="manage board packets" />
  const { packets, documents, meetings } = page.value
  return (
    <main>
      <h1>Board packets</h1>
      <p>
        Seated board members read a packet on their board page once the meeting agenda is published.
        Sending to a seated member emails them a notice. Anyone else gets a link that expires.
      </p>
      <NewPacket meetings={meetings} documents={documents} />
      {packets.length === 0 ? (
        <p>
          No packets yet. Create one from a meeting page once its agenda is published, or add one
          here.
        </p>
      ) : null}
      {packets.map((p) => (
        <section key={p.id} aria-label={p.heading}>
          <h2>{p.heading}</h2>
          <p className="m-0">{p.meeting}</p>
          <p className="m-0">
            {p.documents.length === 0 ? 'No documents.' : `Documents: ${p.documents.join('; ')}.`}
          </p>
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
          <details>
            <summary>Send link</summary>
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
          </details>
        </section>
      ))}
    </main>
  )
}
