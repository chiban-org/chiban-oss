import { desc } from 'drizzle-orm'
import { ActionForm } from '@/components/ActionForm'
import { SelectField, TextField } from '@/components/staff/fields'
import { boardPacketLinks } from '@/db/schema'
import { eligibleBoardDocuments, listPackets } from '@/features/boards/packets'
import { formatCivilDate, formatInstant } from '@/lib/formatDate'
import { requireStaffContext } from '@/server/requireStaff'
import type { CivilDate } from '@/types/civilDate'
import { createPacketAction, revokePacketLinkAction, sendPacketLinkAction } from './actions'

export const dynamic = 'force-dynamic'

const BOARDS: [string, string][] = [
  ['planning_board', 'Planning Board'],
  ['zba', 'Zoning Board of Adjustment'],
]

export default async function PacketsPage() {
  const ctx = await requireStaffContext()
  const packets = await listPackets(ctx.db, ctx.actor, ctx.signal)
  if (!packets.ok) {
    return (
      <main>
        <h1>Board packets</h1>
        <p role="alert">You do not have permission to manage board packets.</p>
      </main>
    )
  }
  const eligible = await eligibleBoardDocuments(ctx.db, ctx.actor, ctx.signal)
  const docs = eligible.ok ? eligible.value : []
  const links = await ctx.db
    .select()
    .from(boardPacketLinks)
    .orderBy(desc(boardPacketLinks.createdAt))
  return (
    <main className="space-y-6">
      <h1>Board packets</h1>
      <section aria-label="New packet">
        <h2>New packet</h2>
        <ActionForm action={createPacketAction} submitLabel="Create packet" variant="default">
          <TextField label="Title" name="title" required />
          <SelectField label="Board" name="board" options={BOARDS} />
          <TextField label="Meeting date" name="meetingDate" type="date" required />
          <fieldset className="space-y-1 border-0 p-0">
            <legend className="font-medium">Documents shared with the board or public</legend>
            {docs.length === 0 ? <p>No documents are shared with the board yet.</p> : null}
            {docs.map((d) => (
              <label key={d.id} className="flex items-center gap-2">
                <input type="checkbox" name="documentId" value={d.id} />
                {d.title}
              </label>
            ))}
          </fieldset>
        </ActionForm>
      </section>
      {packets.value.map((p) => (
        <section key={p.id} aria-label={p.title}>
          <h2>{`${p.title}, ${formatCivilDate(p.meetingDate as CivilDate)}`}</h2>
          <ul className="space-y-1">
            {links
              .filter((l) => l.packetId === p.id)
              .map((l) => (
                <li key={l.id}>
                  {`${l.recipientName} (${l.recipientEmail}), ${l.revokedAt === null ? `expires ${formatInstant(l.expiresAt, 'America/New_York')}` : 'revoked'}`}
                  {l.revokedAt === null ? (
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
              label="Days until it expires (default 14, at most 30)"
              name="days"
              inputMode="numeric"
            />
          </ActionForm>
        </section>
      ))}
    </main>
  )
}
