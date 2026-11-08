import { CheckCircle2, Circle, Minus } from 'lucide-react'
import Link from 'next/link'
import { RemoveFile } from '@/components/documents/ChecklistControls'
import { ApplicantControls, StaffControls } from '@/components/documents/ChecklistRowControls'
import type {
  ChecklistActions,
  ChecklistActor,
  ChecklistPermissions,
} from '@/components/documents/checklistTypes'
import { NEW_TAB } from '@/components/newTab'
import type { ItemStatus } from '@/features/applications/documentChecklist'
import type {
  ChecklistFile,
  ChecklistNote,
  ChecklistRow,
} from '@/features/applications/documentChecklistView'

export interface ItemProps {
  applicationId: string
  row: ChecklistRow
  files: ChecklistFile[]
  actor: ChecklistActor
  permissions: ChecklistPermissions
  actions: ChecklistActions
  maxBytes: number
}

const STATUS_WORDS: ReadonlyMap<ItemStatus, string> = new Map([
  ['provided', 'Provided'],
  ['accepted', 'Accepted without the document'],
  ['waiver_requested', 'Waiver requested'],
  ['not_needed', 'Not needed'],
  ['optional', 'Optional'],
  ['missing', 'Missing'],
])

const DONE: ReadonlySet<ItemStatus> = new Set(['provided', 'accepted', 'waiver_requested'])

function StatusMark({ status }: { status: ItemStatus }) {
  if (DONE.has(status))
    return <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-status-passed-fg" aria-hidden />
  if (status === 'not_needed')
    return <Minus className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
  return <Circle className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
}

function NoteLine({ prefix, note }: { prefix: string; note: ChecklistNote }) {
  return (
    <p className="m-0 text-sm">{`${prefix}: ${note.reason} (${note.by}, ${note.at.slice(0, 10)})`}</p>
  )
}

function FileLinks({ props }: { props: ItemProps }) {
  const { row, applicationId, actions } = props
  if (row.files.length === 0) return null
  const removable = props.permissions.canFile && (props.actor === 'staff' || row.open)
  return (
    <ul className="m-0 grid list-none gap-1 p-0">
      {row.files.map((file) => (
        <li key={file.documentId} className="flex flex-wrap items-center gap-2">
          <Link {...NEW_TAB} href={`/api/documents/${file.documentId}`} className="tap-target">
            {file.title}
          </Link>
          {removable ? (
            <RemoveFile
              applicationId={applicationId}
              itemKey={row.key}
              file={file}
              action={actions.unlink}
            />
          ) : null}
        </li>
      ))}
    </ul>
  )
}

export function ChecklistItem(props: ItemProps) {
  const { row, actor } = props
  const later = actor === 'applicant' && row.stage !== 'to_file' && row.status === 'missing'
  return (
    <li className="grid gap-2 border-b border-hairline py-3 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div className="flex items-start gap-2">
        <StatusMark status={row.status} />
        <div className="min-w-0">
          <p className="m-0 font-medium">{row.label}</p>
          <p className="m-0 text-sm text-muted-foreground">
            {STATUS_WORDS.get(row.status)}
            {later ? '. Can come later' : ''}
          </p>
          {row.help === null ? null : <p className="m-0 text-sm">{row.help}</p>}
        </div>
      </div>
      <div className="grid min-w-0 gap-2">
        {row.notNeeded === null ? null : (
          <p className="m-0 text-sm">{`Not needed: only when ${row.notNeeded}.`}</p>
        )}
        {row.waiver === null ? null : <NoteLine prefix="Waiver requested" note={row.waiver} />}
        {row.accepted === null ? null : <NoteLine prefix="Accepted" note={row.accepted} />}
        <FileLinks props={props} />
        {actor === 'staff' ? <StaffControls props={props} /> : <ApplicantControls props={props} />}
      </div>
    </li>
  )
}
