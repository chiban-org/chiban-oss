import { ActionForm } from '@/components/ActionForm'
import type { DocumentPanelActions, DocumentPanelProps } from '@/components/documents/DocumentRow'
import { RedactedUploader } from '@/components/documents/RedactedUploader'
import { GroupFieldError } from '@/components/fieldErrors'
import { SeePublicLink } from '@/components/SeePublicLink'
import { CheckField, SelectField, TextField } from '@/components/staff/fields'
import type { PanelDocument } from '@/features/documents/panelData'
import type { Audience } from '@/features/documents/types'
import {
  audiencesFor,
  publicViewHref,
  showNote,
  whoCanSeeSentence,
} from '@/features/documents/whoCanSee'
import { formatCivilDate } from '@/lib/formatDate'

const AUDIENCE_LABELS: ReadonlyMap<Audience, string> = new Map([
  ['project_parties', 'Project parties'],
  ['reviewers', 'Assigned reviewers'],
  ['board', 'Board members'],
])

const VERSION_LABELS = { original: 'Original', public_redacted: 'Redacted copy' } as const

function versionLabel(v: PanelDocument['approvable'][number]): string {
  const day = formatCivilDate(v.createdAt.slice(0, 10))
  const time = v.role === 'public_redacted' ? ` ${v.createdAt.slice(11, 16)} UTC` : ''
  return `${VERSION_LABELS[v.role]}, ${day}${time}`
}

function ApprovalControls({ doc, actions }: { doc: PanelDocument; actions: DocumentPanelActions }) {
  const candidates = doc.approvable.filter((v) => v.id !== doc.approvedVersionId)
  return (
    <>
      {actions.approve !== undefined && candidates.length > 0 ? (
        <ActionForm action={actions.approve} submitLabel="Approve for the public">
          <input type="hidden" name="purpose" value="public" />
          {doc.approvalId === null ? null : (
            <p className="m-0 text-sm">
              Approving another version replaces the current public copy.
            </p>
          )}
          <SelectField
            label="Version to approve"
            name="versionId"
            options={candidates.map((v) => [v.id, versionLabel(v)] as const)}
          />
          <TextField label="What you checked before approving" name="reviewStatement" required />
        </ActionForm>
      ) : null}
      {actions.revoke !== undefined && doc.approvalId !== null ? (
        <ActionForm
          action={actions.revoke}
          submitLabel="Revoke the approval"
          confirm={{
            title: `Revoke the approval of ${doc.title}?`,
            body: 'The approved version is no longer cleared for the public until someone approves a version again.',
            confirmLabel: 'Revoke the approval',
          }}
        >
          <input type="hidden" name="approvalId" value={doc.approvalId} />
          <TextField label="Why it is being revoked" name="reason" required />
        </ActionForm>
      ) : null}
    </>
  )
}

function AudienceForm({ doc, props }: { doc: PanelDocument; props: DocumentPanelProps }) {
  return (
    <ActionForm action={props.actions.setAudiences} submitLabel="Save signed-in access">
      <input type="hidden" name="documentId" value={doc.documentId} />
      <p className="m-0 text-sm">
        Signed-in access. Town staff can always open this document. Tick who else may open it after
        signing in. This never puts it on the public site.
      </p>
      <GroupFieldError name="audience" />
      <div className="flex flex-wrap gap-4">
        {audiencesFor(doc.recordKind).map((a) => (
          <CheckField
            key={a}
            label={AUDIENCE_LABELS.get(a) ?? a}
            name="audience"
            groupMember
            value={a}
            defaultChecked={doc.audiences.includes(a)}
          />
        ))}
      </div>
    </ActionForm>
  )
}

function PublicForm({ doc, props }: { doc: PanelDocument; props: DocumentPanelProps }) {
  return (
    <ActionForm
      action={props.actions.setPublic}
      submitLabel="Save public site setting"
      confirm={
        doc.isPublic
          ? {
              title: `Hide ${doc.title} from the public site?`,
              body: 'Signed-out visitors can no longer see or download this document.',
              confirmLabel: 'Hide from the public site',
              when: { name: 'isPublic', oneOf: [''] },
            }
          : undefined
      }
    >
      <input type="hidden" name="documentId" value={doc.documentId} />
      <p className="m-0 text-sm">{showNote(doc)}</p>
      <CheckField
        label="Show on the public site"
        name="isPublic"
        value="yes"
        defaultChecked={doc.isPublic}
      />
    </ActionForm>
  )
}

export function WhoCanSee({ doc, props }: { doc: PanelDocument; props: DocumentPanelProps }) {
  const audienceChoices = props.canManage && audiencesFor(doc.recordKind).length > 0
  return (
    <section aria-label="Who can see this" data-slot="who-can-see" className="grid gap-1">
      <p className="text-sm">
        <span className="font-semibold">Who can see this: </span>
        {whoCanSeeSentence(doc)}
      </p>
      <SeePublicLink href={publicViewHref(doc)} className="text-sm" />
      {audienceChoices || props.canPublish ? (
        <details>
          <summary className="text-sm">Change who can see this</summary>
          <div className="mt-3 space-y-4 rounded-md bg-canvas p-4">
            {audienceChoices ? <AudienceForm doc={doc} props={props} /> : null}
            {props.canPublish ? (
              <>
                <PublicForm doc={doc} props={props} />
                <ApprovalControls doc={doc} actions={props.actions} />
                <RedactedUploader
                  documentId={doc.documentId}
                  target={props.target}
                  seriesKey={doc.series?.key}
                  actions={props.actions.uploadRedacted}
                />
              </>
            ) : null}
          </div>
        </details>
      ) : null}
    </section>
  )
}
