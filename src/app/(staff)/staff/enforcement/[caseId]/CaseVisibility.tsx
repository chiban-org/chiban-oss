import { ActionForm } from '@/components/ActionForm'
import { FactList } from '@/components/layout/PageHeader'
import { TextField } from '@/components/staff/fields'
import type { CaseDetail } from '@/features/enforcement/caseDetail'
import { publishCaseAction, unpublishCaseAction } from '../publishActions'
import type { Can } from './can'
import { Hidden } from './Section'

function HideControl({ detail }: { detail: CaseDetail }) {
  const { row } = detail.staff
  return (
    <div className="space-y-2">
      <p>{`This case is shown on the public site. Summary: ${row.publicSummary ?? ''}`}</p>
      <ActionForm
        action={unpublishCaseAction}
        submitLabel="Hide the case from the public site"
        confirm={{
          title: 'Hide this case from the public site?',
          body: 'The public site stops showing the case, its summary and its public complaint text.',
          confirmLabel: 'Hide it',
        }}
      >
        <Hidden name="caseId" value={row.id} />
      </ActionForm>
    </div>
  )
}

function ShowControl({ detail }: { detail: CaseDetail }) {
  return (
    <details>
      <summary>Show the case on the public site</summary>
      <ActionForm action={publishCaseAction} submitLabel="Show the case on the public site">
        <Hidden name="caseId" value={detail.staff.row.id} />
        <TextField label="Public summary" name="summary" required />
        <p className="m-0">
          The public page for the parcel shows the case number, status, dates, summary, public
          complaint text, the provisions cited, and issued order numbers. Photos stay private until
          you show them one by one.
        </p>
      </ActionForm>
    </details>
  )
}

export function CaseVisibility({ detail, can }: { detail: CaseDetail; can: Can }) {
  const { row } = detail.staff
  const label = row.isPublic ? 'Public' : 'Private to town staff'
  return (
    <section aria-label="Visibility" data-plain className="flex flex-col gap-2">
      <FactList facts={[{ label: 'Visibility', value: label }]} stacked />
      {!can.manage ? null : row.isPublic ? (
        <HideControl detail={detail} />
      ) : (
        <ShowControl detail={detail} />
      )}
    </section>
  )
}
