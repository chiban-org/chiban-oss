import { ActionForm } from '@/components/ActionForm'
import { ProvisionFields } from '@/components/enforcement/ProvisionFields'
import { FormDialog, RowEditDialog } from '@/components/FormDialog'
import { StatusChip } from '@/components/StatusChip'
import { AreaField, TextField } from '@/components/staff/fields'
import type { CaseDetail } from '@/features/enforcement/caseDetail'
import { type FindingUses, mayEditFinding } from '@/features/enforcement/findingUses'
import { FINDING_STATUS_LABELS, PROVISION_KIND_LABELS } from '@/features/enforcement/labels'
import { formatCivilDate } from '@/lib/formatDate'
import {
  editFindingAction,
  markFindingCorrectedAction,
  withdrawFindingAction,
} from '../findingFixActions'
import { Hidden } from './Section'

type Finding = CaseDetail['findings'][number]

const CHIP = { open: 'failed', corrected: 'passed', withdrawn: 'neutral' } as const

export function findingTitle(f: Pick<Finding, 'provisionKind' | 'provisionRef'>): string {
  return `${PROVISION_KIND_LABELS[f.provisionKind]}: ${f.provisionRef}`
}

function EditFinding({ finding, detail }: { finding: Finding; detail: CaseDetail }) {
  return (
    <RowEditDialog
      record={findingTitle(finding)}
      title="Edit the finding"
      description="Only a finding that no notice or order includes can be edited. The change is kept in the case audit log."
    >
      <ActionForm action={editFindingAction} submitLabel="Save finding" className="max-w-xl">
        <Hidden name="findingId" value={finding.id} />
        <ProvisionFields
          suggestions={detail.suggestions ?? null}
          defaultKind={finding.provisionKind}
          defaultRef={finding.provisionRef}
        />
        <AreaField label="Facts" name="facts" rows={3} defaultValue={finding.facts} required />
        <TextField
          label="Inspection date"
          name="inspectionDate"
          type="date"
          defaultValue={finding.inspectionDate}
          required
        />
      </ActionForm>
    </RowEditDialog>
  )
}

function MarkCorrected({ finding, detail }: { finding: Finding; detail: CaseDetail }) {
  return (
    <FormDialog
      label="Mark corrected"
      accessibleLabel={`Mark ${findingTitle(finding)} corrected`}
      title="Mark the finding corrected"
      description="Use this when the violation was fixed. An order whose findings are all corrected is marked complied with."
      size="sm"
    >
      <ActionForm action={markFindingCorrectedAction} submitLabel="Mark corrected">
        <Hidden name="findingId" value={finding.id} />
        <TextField
          label="Date corrected"
          name="correctedOn"
          type="date"
          defaultValue={detail.today}
          required
        />
        <AreaField label="Note" name="note" rows={2} />
      </ActionForm>
    </FormDialog>
  )
}

function Withdraw({ finding }: { finding: Finding }) {
  const title = findingTitle(finding)
  return (
    <FormDialog
      label="Withdraw"
      accessibleLabel={`Withdraw ${title}`}
      title="Withdraw the finding"
      description="Use this for a finding recorded by mistake. Notices and orders already generated stay as they are."
      size="sm"
    >
      <ActionForm
        action={withdrawFindingAction}
        submitLabel="Withdraw finding"
        variant="destructive"
        confirm={{
          title: 'Withdraw this finding?',
          body: `${title} drops out of the notice and order choices. Documents already generated stay unchanged.`,
          confirmLabel: 'Withdraw finding',
        }}
      >
        <Hidden name="findingId" value={finding.id} />
        <AreaField label="Why it is withdrawn" name="reason" rows={2} required />
      </ActionForm>
    </FormDialog>
  )
}

function statusLine(f: Finding, names: Record<string, string>): string | null {
  if (f.status === 'withdrawn') {
    const who = f.withdrawnBy === null ? 'staff' : (names[f.withdrawnBy] ?? 'staff')
    return `Withdrawn by ${who}: ${f.withdrawnReason ?? ''}`
  }
  if (f.status === 'corrected' && f.correctedOn !== null) {
    const note = f.correctedNote === null ? '' : ` ${f.correctedNote}`
    return `Corrected ${formatCivilDate(f.correctedOn)}.${note}`
  }
  return null
}

export function FindingRow({
  finding: f,
  detail,
  uses,
  manage,
}: {
  finding: Finding
  detail: CaseDetail
  uses: FindingUses
  manage: boolean
}) {
  const line = statusLine(f, detail.names)
  const used = uses.get(f.id) ?? []
  return (
    <li className="record-item space-y-1">
      <div className="flex flex-wrap items-start gap-2">
        <p
          className={f.status === 'withdrawn' ? 'm-0 font-medium line-through' : 'm-0 font-medium'}
        >
          {findingTitle(f)}
        </p>
        <StatusChip status={CHIP[f.status]} label={FINDING_STATUS_LABELS[f.status]} />
      </div>
      <p>{`${f.facts} Inspected ${formatCivilDate(f.inspectionDate)}, found by ${detail.names[f.foundBy] ?? 'staff'}.`}</p>
      {line === null ? null : <p className="text-muted-foreground">{line}</p>}
      {used.length === 0 ? null : (
        <p className="text-sm text-muted-foreground">{`${used.join('. ')}.`}</p>
      )}
      {manage && f.status === 'open' ? (
        <div className="flex flex-wrap items-start gap-2 pt-1">
          {mayEditFinding(f, uses) ? <EditFinding finding={f} detail={detail} /> : null}
          <details className="more-actions">
            <summary className="text-sm" aria-label={`More actions for ${findingTitle(f)}`}>
              More
            </summary>
            <div className="flex flex-wrap gap-2 pt-2">
              <MarkCorrected finding={f} detail={detail} />
              <Withdraw finding={f} />
            </div>
          </details>
        </div>
      ) : null}
    </li>
  )
}
