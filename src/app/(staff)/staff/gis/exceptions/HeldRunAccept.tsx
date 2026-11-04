import Link from 'next/link'
import { ActionForm } from '@/components/ActionForm'
import type { importRuns } from '@/db/schema'
import { layerLabel } from '@/features/gis/import/runText'
import { formatInstantLong } from '@/lib/formatDate'
import { acceptAllOwnerChangesAction } from './actions'

type ImportRun = typeof importRuns.$inferSelect

export function HeldRunAccept({
  run,
  held,
  timeZone,
}: {
  run: ImportRun
  held: number
  timeZone: string
}) {
  return (
    <ActionForm
      action={acceptAllOwnerChangesAction}
      submitLabel="Accept all owner changes from this import"
      className="toolbar mb-3"
    >
      <input type="hidden" name="runId" value={run.id} />
      <p className="m-0">
        {`${held} held owner ${held === 1 ? 'change' : 'changes'} from the `}
        <Link href={`/staff/gis/imports/${run.id}`}>
          {`${layerLabel(run.layerKey)} import of ${formatInstantLong(run.startedAt, timeZone)}`}
        </Link>
      </p>
    </ActionForm>
  )
}
