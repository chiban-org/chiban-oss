import type { RecordEventKind } from '@packs/nh/schema'
import Link from 'next/link'
import { ActionForm } from '@/components/ActionForm'
import { SortHeader } from '@/components/dataTable/SortHeader'
import { SelectField, TextField } from '@/components/staff/fields'
import type { SortLink } from '@/features/dataTable/sort'
import type { RetentionStatus } from '@/features/records/computeRetention'
import type { WorklistRow, WorklistSortKey, WorklistState } from '@/features/records/worklist'
import { formatCivilDate } from '@/lib/formatDate'
import { recordRetentionEventAction } from './actions'

const KIND_LABELS = { document: 'Document', application_snapshot: 'Application snapshot' } as const

const EVENT_LABELS = {
  case: [['appeal_period_expired', 'The appeal period ended']],
  project: [
    ['building_removed', 'The building was removed'],
    ['septic_replaced_or_removed', 'The septic system was replaced or removed'],
  ],
} as const

const AUTOMATIC_EVENTS: ReadonlyMap<RecordEventKind, string> = new Map([
  ['registration_expired', 'Chiban records this when the registration expires.'],
  ['application_withdrawn', 'Chiban records this when the application is withdrawn.'],
  ['application_denied', 'Chiban records this when the application is denied.'],
])

function eventChoices(row: WorklistRow): [string, string][] {
  const { eventTarget, status } = row
  if (eventTarget === null || status.state !== 'not_yet_triggered') return []
  const awaiting: readonly string[] = status.awaiting
  return EVENT_LABELS[eventTarget.kind]
    .filter(([event]) => awaiting.includes(event))
    .map(([k, l]) => [k, l])
}

function automaticNotes(status: RetentionStatus): string[] {
  if (status.state !== 'not_yet_triggered') return []
  return status.awaiting.flatMap((event) => {
    const note = AUTOMATIC_EVENTS.get(event)
    return note === undefined ? [] : [note]
  })
}

function eligibleText(status: RetentionStatus): string {
  return status.state === 'eligible_on' ? formatCivilDate(status.date) : 'After an event'
}

function RecordCell({ row }: { row: WorklistRow }) {
  return (
    <span className="flex flex-col">
      {row.href === null ? row.title : <Link href={row.href}>{row.title}</Link>}
      {row.owner === null || row.title.includes(row.owner) ? null : (
        <span className="text-sm text-muted-foreground">{row.owner}</span>
      )}
    </span>
  )
}

function EventCell({ row, mayRecord }: { row: WorklistRow; mayRecord: boolean }) {
  const choices = mayRecord ? eventChoices(row) : []
  const notes = automaticNotes(row.status)
  return (
    <>
      {notes.map((note) => (
        <p key={note} className="m-0 text-sm">
          {note}
        </p>
      ))}
      {row.eventTarget === null || choices.length === 0 ? null : (
        <details>
          <summary>Record event</summary>
          <ActionForm action={recordRetentionEventAction} submitLabel="Record event">
            <input type="hidden" name="targetKind" value={row.eventTarget.kind} />
            <input type="hidden" name="targetId" value={row.eventTarget.id} />
            <SelectField label="What happened" name="kind" options={choices} />
            <TextField label="Date it happened" name="occurredOn" type="date" required />
          </ActionForm>
        </details>
      )}
    </>
  )
}

export function WorklistTable({
  rows,
  state,
  links,
  mayRecord,
}: {
  rows: WorklistRow[]
  state: WorklistState
  links: Record<WorklistSortKey, SortLink>
  mayRecord: boolean
}) {
  const waiting = state === 'awaiting_event'
  return (
    <table className="w-full min-w-[48rem] text-left">
      <thead>
        <tr>
          <SortHeader label="Record" link={links.record} />
          <SortHeader label="Kind" link={links.kind} />
          <SortHeader label="Retention series" link={links.series} />
          <SortHeader label="Eligible on" link={links.eligible} />
          {waiting ? <th scope="col">Event</th> : null}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={`${row.ref.kind}-${row.ref.id}`}>
            <td>
              <RecordCell row={row} />
            </td>
            <td className="whitespace-nowrap">{KIND_LABELS[row.ref.kind]}</td>
            <td>
              {`${row.series.label} `}
              <a href={row.series.citation.url}>{row.series.citation.label}</a>
            </td>
            <td className="whitespace-nowrap">
              {eligibleText(row.status)}
              {row.holds > 1 ? (
                <span className="block text-sm text-muted-foreground">{`${row.holds} holds`}</span>
              ) : null}
            </td>
            {waiting ? (
              <td>
                <EventCell row={row} mayRecord={mayRecord} />
              </td>
            ) : null}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
