import type { RecordEventKind } from '@packs/nh/schema'
import { desc } from 'drizzle-orm'
import Link from 'next/link'
import { ActionForm } from '@/components/ActionForm'
import { SelectField, TextField } from '@/components/staff/fields'
import { NoPermission } from '@/components/staff/NoPermission'
import { dispositionBatches } from '@/db/schema'
import type { RetentionStatus } from '@/features/records/computeRetention'
import { retentionText } from '@/features/records/retentionText'
import { retentionWorklist, type WorklistState } from '@/features/records/worklist'
import { mayOpen } from '@/features/staffNav/navItems'
import { loadNavViewer } from '@/features/staffNav/viewer'
import { townToday } from '@/features/town/today'
import { formatCivilDate } from '@/lib/formatDate'
import { requireStaffContext } from '@/server/requireStaff'
import { proposeDispositionAction, recordRetentionEventAction } from './actions'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25
const STATES: [WorklistState, string][] = [
  ['eligible', 'Eligible now'],
  ['awaiting_event', 'Waiting for an event'],
  ['on_hold', 'On legal hold'],
]
const BATCH_LABELS = {
  proposed: 'Waiting for approval',
  approved: 'Approved',
  executing: 'Being carried out',
  executed: 'Carried out',
  cancelled: 'Cancelled',
} as const
const EVENT_LABELS = {
  case: [['appeal_period_expired', 'The appeal period ended']],
  project: [
    ['building_removed', 'The building was removed'],
    ['septic_replaced_or_removed', 'The septic system was replaced or removed'],
  ],
} as const

const AUTOMATIC_EVENTS: Partial<Record<RecordEventKind, string>> = {
  registration_expired: 'Chiban records this when the registration expires.',
  application_withdrawn: 'Chiban records this when the application is withdrawn.',
  application_denied: 'Chiban records this when the application is denied.',
}

function eventChoices(kind: 'case' | 'project', status: RetentionStatus): [string, string][] {
  const awaiting: readonly string[] = status.state === 'not_yet_triggered' ? status.awaiting : []
  return EVENT_LABELS[kind].filter(([event]) => awaiting.includes(event)).map(([k, l]) => [k, l])
}

function automaticNotes(status: RetentionStatus): string[] {
  if (status.state !== 'not_yet_triggered') return []
  return status.awaiting.flatMap((event) => {
    const note = AUTOMATIC_EVENTS[event]
    return note === undefined ? [] : [note]
  })
}

function stateOf(value: string | undefined): WorklistState {
  return STATES.find(([s]) => s === value)?.[0] ?? 'eligible'
}

export default async function RetentionPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; cursor?: string }>
}) {
  const params = await searchParams
  const ctx = await requireStaffContext()
  if (!mayOpen('/staff/records/retention', await loadNavViewer(ctx.db, ctx.actor, ctx.signal))) {
    return <NoPermission title="Retention" action="see the retention worklist" />
  }
  const state = stateOf(params.state)
  const today = await townToday(ctx.db, new Date(), ctx.signal)
  const list = await retentionWorklist(
    ctx.db,
    ctx.actor,
    {
      asOf: today,
      state,
      limit: PAGE_SIZE,
      ...(params.cursor === undefined ? {} : { cursor: params.cursor }),
    },
    ctx.signal,
  )
  const batches = await ctx.db
    .select()
    .from(dispositionBatches)
    .orderBy(desc(dispositionBatches.proposedAt))
    .limit(10)
  return (
    <main className="space-y-6">
      <h1>Retention</h1>
      <nav aria-label="Retention lists" className="flex flex-wrap gap-4">
        {STATES.map(([key, label]) => (
          <Link
            key={key}
            href={`/staff/records/retention?state=${key}`}
            aria-current={key === state ? 'page' : undefined}
            className={key === state ? 'font-semibold underline' : 'text-action underline'}
          >
            {label}
          </Link>
        ))}
      </nav>
      {list.rows.length === 0 ? (
        <p>No records are in this list.</p>
      ) : (
        <ul className="m-0 list-none space-y-3 p-0">
          {list.rows.map((row) => (
            <li key={`${row.ref.kind}-${row.ref.id}`} className="space-y-2 rounded-md border p-3">
              <p className="m-0 font-medium">{row.title}</p>
              <p className="m-0">
                {row.series.label}{' '}
                <a href={row.series.citation.url} className="text-action underline">
                  {row.series.citation.label}
                </a>
                {`. ${retentionText(row.status)}`}
                {row.holds > 0
                  ? ` On ${row.holds} legal ${row.holds === 1 ? 'hold' : 'holds'}.`
                  : ''}
              </p>
              {state === 'awaiting_event'
                ? automaticNotes(row.status).map((note) => (
                    <p key={note} className="m-0">
                      {note}
                    </p>
                  ))
                : null}
              {state === 'awaiting_event' &&
              row.eventTarget !== null &&
              eventChoices(row.eventTarget.kind, row.status).length > 0 ? (
                <ActionForm action={recordRetentionEventAction} submitLabel="Record event">
                  <input type="hidden" name="targetKind" value={row.eventTarget.kind} />
                  <input type="hidden" name="targetId" value={row.eventTarget.id} />
                  <SelectField
                    label="What happened"
                    name="kind"
                    options={eventChoices(row.eventTarget.kind, row.status)}
                  />
                  <TextField label="Date it happened" name="occurredOn" type="date" required />
                </ActionForm>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {list.nextCursor === null ? null : (
        <Link
          href={`/staff/records/retention?state=${state}&cursor=${encodeURIComponent(list.nextCursor)}`}
          className="inline-block text-action underline"
        >
          Next page
        </Link>
      )}
      <section aria-labelledby="propose" className="space-y-3 border-t pt-4">
        <h2 id="propose">Disposition batches</h2>
        <ActionForm action={proposeDispositionAction} submitLabel="Propose a batch">
          <TextField
            label="Records eligible on or before"
            name="asOf"
            type="date"
            defaultValue={today}
            required
          />
        </ActionForm>
        {batches.length === 0 ? (
          <p>No batches yet.</p>
        ) : (
          <ul className="m-0 list-none space-y-1 p-0">
            {batches.map((b) => (
              <li key={b.id}>
                <Link href={`/staff/records/disposition/${b.id}`} className="text-action underline">
                  {`Batch as of ${formatCivilDate(b.asOf)}`}
                </Link>
                {`: ${BATCH_LABELS[b.status]}`}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
