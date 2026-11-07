import Link from 'next/link'
import { ChecklistForm } from '@/components/inspections/ChecklistForm'
import { recordResultAction } from '../../inspections/[inspectionId]/actions'
import type { DueInspection } from './dueInspection'
import { RowActions } from './inspectionsPanel'
import { PreviousResult } from './inspectorSections'

export function InspectionResultForm({ due, number }: { due: DueInspection; number: string }) {
  const { view, row, data } = due
  return (
    <>
      <PreviousResult next={view} data={data} />
      <ChecklistForm
        key={row.id}
        inspectionId={row.id}
        rowVersion={view.inspection.rowVersion}
        items={view.items}
        action={recordResultAction}
        initialNotes=""
      />
      <RowActions row={row} data={data} number={number} />
      <p>
        <Link href={`/staff/inspections/${row.id}`}>
          Open the inspection for photos and the site contact
        </Link>
      </p>
    </>
  )
}
