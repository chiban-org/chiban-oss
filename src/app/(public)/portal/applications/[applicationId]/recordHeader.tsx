import Link from 'next/link'
import { PageHeader } from '@/components/layout/PageHeader'
import { StageStrip } from '@/components/layout/StageStrip'
import { DoThisNowCard } from '@/components/layout/WorkPlan'
import { StatusChip } from '@/components/StatusChip'
import { Button } from '@/components/ui/button'
import { applicationChipStatus } from '@/features/applications/chipStatus'
import { stagesFor } from '@/features/applications/stageStrip'
import { honestText } from '@/features/honest/honest'
import type { ApplicantNow, ApplicantStatus } from '@/features/portal/applicantStatus'
import type { PortalApplicationView } from '@/features/portal/portalView'
import { formatCivilDate } from '@/lib/formatDate'
import { formatCents } from '@/lib/money'
import { PortalPayButton } from './PayAndForm'

const LINK = 'tap-target inline-flex items-center'

function stagesOf(view: PortalApplicationView) {
  const { record } = view
  return stagesFor({
    state: view.state,
    substep: record.substep,
    board: record.board,
    allowsDirectIssue: record.allowsDirectIssue,
    completeness: record.completeness,
    receivedDate: record.receivedDate,
    completedDate: record.completedDate,
    issuedOn: record.issuedOn,
    overdue: view.decisionDue?.late ?? false,
  })
}

function facts(view: PortalApplicationView) {
  const { record } = view
  return [
    { label: 'Application number', value: view.number },
    ...(record.receivedDate === null
      ? []
      : [{ label: 'Submitted', value: formatCivilDate(record.receivedDate) }]),
    ...(record.issuedOn === null
      ? []
      : [{ label: 'Issued', value: formatCivilDate(record.issuedOn) }]),
  ]
}

function NowAction({ now, view }: { now: ApplicantNow; view: PortalApplicationView }) {
  if (now.action === 'pay') {
    return (
      <>
        {view.convenienceCents > 0 ? (
          <p>{`Paying online adds a ${formatCents(view.convenienceCents)} card convenience fee.`}</p>
        ) : null}
        <div>
          <PortalPayButton applicationId={view.applicationId} dueCents={view.onlineTotalCents} />
        </div>
      </>
    )
  }
  if (now.action === 'inspect') {
    return (
      <div>
        <Button asChild className="min-h-11 text-base no-underline">
          <Link href={`/portal/applications/${view.applicationId}/inspections`}>
            Request an inspection
          </Link>
        </Button>
      </div>
    )
  }
  if (now.action === 'documents') {
    return (
      <a href="#documents-heading" className={LINK}>
        Go to documents
      </a>
    )
  }
  return (
    <a href="#attest" className={LINK}>
      Go to the confirmation and submit
    </a>
  )
}

export function RecordHeader({
  view,
  status,
}: {
  view: PortalApplicationView
  status: ApplicantStatus
}) {
  const address = honestText(view.parcel.siteAddress, 'Address not on file')
  return (
    <>
      <PageHeader
        kicker={view.typeLabel}
        title={view.record.projectTitle}
        status={<StatusChip status={applicationChipStatus(view.state)} label={view.stateLabel} />}
        lead={`${address}${view.parcel.displayId === null ? '' : `, parcel ${view.parcel.displayId}`}`}
        summary={
          <div className="flex flex-col gap-3">
            <p data-slot="status-sentence" className="m-0 max-w-[75ch] text-lg">
              {status.sentence}
            </p>
            <StageStrip stages={stagesOf(view)} />
          </div>
        }
        facts={facts(view)}
      />
      {status.now === null ? null : (
        <DoThisNowCard task={status.now.task} note={status.now.note} warnings={[]}>
          <NowAction now={status.now} view={view} />
        </DoThisNowCard>
      )}
    </>
  )
}
