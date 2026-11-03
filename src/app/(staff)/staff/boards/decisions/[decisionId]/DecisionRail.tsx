import Link from 'next/link'
import { ActionForm } from '@/components/ActionForm'
import { NextStep } from '@/components/layout/NextStep'
import { FactList } from '@/components/layout/PageHeader'
import { StatusChip } from '@/components/StatusChip'
import type { DecisionView } from '@/features/decisions/decisionView'
import { generateDecisionDocumentsAction } from '../../hearings/decisionActions'

type StepKind = 'generate' | 'file' | 'transmittal' | 'proof'

const STEP_LINKS: Record<Exclude<StepKind, 'generate'>, { href: string; label: string }> = {
  file: { href: '#file-decision', label: 'File the decision with the minutes' },
  transmittal: { href: '#transmittal', label: 'Start the regional transmittal' },
  proof: { href: '#record-transmittal', label: 'Record proof of transmittal' },
}

function stepOf(view: DecisionView): StepKind | null {
  if (!view.documentsGenerated) return 'generate'
  if (view.filedText === null) return 'file'
  if (view.regional && !view.transmittalStarted) return 'transmittal'
  const open = view.transmittal?.checklist.some((i) => i.state !== 'proved_on_time') ?? false
  return open ? 'proof' : null
}

function Step({ view, kind }: { view: DecisionView; kind: StepKind }) {
  if (kind === 'generate') {
    return (
      <ActionForm
        action={generateDecisionDocumentsAction}
        submitLabel="Create the Notice of Decision"
        variant="default"
      >
        <input type="hidden" name="decisionId" value={view.decisionId} />
      </ActionForm>
    )
  }
  const link = STEP_LINKS[kind]
  return (
    <p>
      <a href={link.href}>{link.label}</a>
    </p>
  )
}

function FilingDue({ due }: { due: NonNullable<DecisionView['filingDue']> }) {
  return (
    <div className="flex flex-col items-start gap-2">
      <p className="m-0 text-sm font-semibold text-muted-foreground">
        Minutes and written decision
      </p>
      {due.overdue ? (
        <StatusChip status="overdue" label={`Due ${due.text} (overdue)`} />
      ) : (
        <p className="m-0">{`Due ${due.text}`}</p>
      )}
    </div>
  )
}

function decisionFacts(view: DecisionView) {
  return [
    {
      label: 'Application',
      value: (
        <Link href={`/staff/applications/${view.applicationId}`}>
          {`${view.typeLabel} ${view.applicationNumber}`}
        </Link>
      ),
    },
    { label: 'Vote', value: view.voteText },
    ...(view.filedText === null ? [] : [{ label: 'Filed', value: view.filedText }]),
  ]
}

export function DecisionRail({ view }: { view: DecisionView }) {
  const kind = stepOf(view)
  const due = view.filedText === null ? view.filingDue : null
  return (
    <>
      {kind === null && due === null ? null : (
        <div className="rail-card">
          {kind === null ? null : (
            <NextStep>
              <Step view={view} kind={kind} />
            </NextStep>
          )}
          {kind === 'generate' ? (
            <p className="text-sm text-ink-secondary">
              Create the Notice of Decision before filing.
            </p>
          ) : null}
          {due === null ? null : <FilingDue due={due} />}
        </div>
      )}
      <div className="rail-card">
        <FactList facts={decisionFacts(view)} stacked />
      </div>
    </>
  )
}
