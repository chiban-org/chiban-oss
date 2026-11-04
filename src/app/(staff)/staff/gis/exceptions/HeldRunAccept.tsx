import Link from 'next/link'
import { ActionForm } from '@/components/ActionForm'
import type { importRuns } from '@/db/schema'
import { layerLabel } from '@/features/gis/import/runText'
import { formatInstantLong } from '@/lib/formatDate'
import { acceptAllOwnerChangesAction } from './actions'

type ImportRun = typeof importRuns.$inferSelect

export interface HeldRun {
  run: ImportRun
  held: number
}

function HeldRunRow({ run, held, timeZone }: HeldRun & { timeZone: string }) {
  return (
    <li className="record-item flex flex-wrap items-center justify-between gap-3">
      <p className="m-0">
        <Link href={`/staff/gis/imports/${run.id}`}>
          {`${layerLabel(run.layerKey)} import of ${formatInstantLong(run.startedAt, timeZone)}`}
        </Link>
        <span className="text-muted-foreground">{`, ${held} owner ${held === 1 ? 'change' : 'changes'} held`}</span>
      </p>
      <ActionForm
        action={acceptAllOwnerChangesAction}
        submitLabel="Accept all owner changes from this import"
        compact
      >
        <input type="hidden" name="runId" value={run.id} />
      </ActionForm>
    </li>
  )
}

export function HeldRunsPanel({ runs, timeZone }: { runs: HeldRun[]; timeZone: string }) {
  if (runs.length === 0) return null
  return (
    <section>
      <h2>Held owner changes</h2>
      <p className="text-muted-foreground">
        Owner changes wait for review. Accept an import's changes all at once, or apply them one by
        one below.
      </p>
      <ul className="flex flex-col gap-3">
        {runs.map((entry) => (
          <HeldRunRow key={entry.run.id} {...entry} timeZone={timeZone} />
        ))}
      </ul>
    </section>
  )
}
