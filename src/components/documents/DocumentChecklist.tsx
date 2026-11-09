import Link from 'next/link'
import { ApplicantRow, NotNeededRows, ruleOf } from '@/components/documents/applicantRows'
import { AssignFile } from '@/components/documents/ChecklistControls'
import { ChecklistItem } from '@/components/documents/ChecklistItem'
import type {
  ChecklistActions,
  ChecklistActor,
  ChecklistPermissions,
} from '@/components/documents/checklistTypes'
import { LiveStageGate } from '@/components/documents/LiveChecklist'
import { MultiFileUploader } from '@/components/documents/MultiFileUploader'
import { NEW_TAB } from '@/components/newTab'
import type { DocumentChecklistView } from '@/features/applications/documentChecklistView'

export type {
  ChecklistActions,
  ChecklistActor,
  ChecklistPermissions,
} from '@/components/documents/checklistTypes'

interface Props {
  view: DocumentChecklistView
  actor: ChecklistActor
  permissions: ChecklistPermissions
  actions: ChecklistActions
  maxBytes: number
  headingLevel?: 'h3' | 'h4'
}

function assignable(props: Props): { key: string; label: string }[] {
  const rows = props.view.stages.flatMap((s) => s.rows)
  const open = props.actor === 'staff' ? rows : rows.filter((r) => r.open)
  return open.filter((r) => r.status !== 'not_needed').map((r) => ({ key: r.key, label: r.label }))
}

function OtherDocuments({ props }: { props: Props }) {
  const { view, actions, permissions } = props
  const Heading = props.headingLevel ?? 'h3'
  const items = permissions.canFile ? assignable(props) : []
  if (view.other.length === 0 && !(permissions.canUploadOther && actions.upload)) return null
  return (
    <section data-plain aria-label="Other documents" className="grid gap-2">
      <Heading className="m-0">Other documents</Heading>
      <ul className="m-0 grid list-none gap-2 p-0">
        {view.other.map((file) => (
          <li
            key={file.documentId}
            className="grid gap-2 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]"
          >
            <Link {...NEW_TAB} href={`/api/documents/${file.documentId}`} className="tap-target">
              {file.title}
            </Link>
            <AssignFile
              applicationId={view.applicationId}
              file={file}
              items={items}
              action={actions.link}
            />
          </li>
        ))}
      </ul>
      {permissions.canUploadOther && actions.upload !== undefined ? (
        <MultiFileUploader
          applicationId={view.applicationId}
          maxBytes={props.maxBytes}
          actions={actions.upload}
        />
      ) : null}
    </section>
  )
}

export function DocumentChecklist(props: Props) {
  const { view } = props
  const Heading = props.headingLevel ?? 'h3'
  const rowProps = {
    applicationId: view.applicationId,
    files: view.files,
    actor: props.actor,
    permissions: props.permissions,
    actions: props.actions,
    maxBytes: props.maxBytes,
    submitted: view.submitted,
  }
  return (
    <div className="grid gap-4">
      {view.stages.map((stage) => {
        const section = (
          <section data-plain key={stage.stage} aria-label={stage.label}>
            <Heading className="m-0">{stage.label}</Heading>
            <ul className="m-0 list-none p-0">
              {stage.rows.map((row) =>
                props.actor === 'applicant' ? (
                  <ApplicantRow key={row.key} row={row} props={rowProps} />
                ) : (
                  <ChecklistItem key={row.key} {...rowProps} row={row} />
                ),
              )}
            </ul>
          </section>
        )
        return props.actor === 'applicant' ? (
          <LiveStageGate key={stage.stage} rules={stage.rows.map(ruleOf)}>
            {section}
          </LiveStageGate>
        ) : (
          section
        )
      })}
      {props.actor === 'applicant' ? (
        <NotNeededRows rows={view.stages.flatMap((s) => s.rows)} />
      ) : null}
      <OtherDocuments props={props} />
    </div>
  )
}
