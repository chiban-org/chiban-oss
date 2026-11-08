import Link from 'next/link'
import { ActionForm } from '@/components/ActionForm'
import { intakeHref } from '@/features/counter/intake/intakeHref'
import type { UnfinishedIntake } from '@/features/counter/intake/unfinished'
import { formatInstant } from '@/lib/formatDate'
import type { ActionResult } from '@/server/actionRunner'

interface Props {
  rows: readonly UnfinishedIntake[]
  zone: string
  discard: (formData: FormData) => Promise<ActionResult>
}

function IntakeRow({ row, zone, discard }: { row: UnfinishedIntake } & Omit<Props, 'rows'>) {
  return (
    <li className="record-item flex flex-wrap items-start justify-between gap-3">
      <div className="flex flex-col gap-0.5">
        <Link href={intakeHref(row.applicationId)} className="font-semibold">
          {`${row.typeLabel} for ${row.applicantName}`}
        </Link>
        <span>{row.parcelLabel === '' ? 'Parcel on file' : row.parcelLabel}</span>
        <span className="text-sm text-muted-foreground">
          {`${row.number}, started by ${row.takenByName} on ${formatInstant(row.takenAt, zone)}`}
        </span>
      </div>
      <ActionForm
        action={discard}
        submitLabel="Discard"
        submitAccessibleLabel={`Discard ${row.number}`}
        compact
        confirm={{
          title: `Discard ${row.number}?`,
          body: 'The unfinished application is withdrawn and leaves this list. Files already scanned stay on its record.',
          confirmLabel: 'Discard',
        }}
      >
        <input type="hidden" name="applicationId" value={row.applicationId} />
      </ActionForm>
    </li>
  )
}

export function UnfinishedIntakes({ rows, zone, discard }: Props) {
  if (rows.length === 0) return null
  return (
    <section aria-labelledby="unfinished">
      <h2 id="unfinished">Unfinished at the counter</h2>
      <p className="text-muted-foreground">
        Applications started at the counter and not yet submitted. Open one to carry on.
      </p>
      <ul className="list-none p-0">
        {rows.map((row) => (
          <IntakeRow key={row.applicationId} row={row} zone={zone} discard={discard} />
        ))}
      </ul>
    </section>
  )
}
