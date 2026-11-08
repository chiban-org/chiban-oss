import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { saveIntakeAction } from '@/app/(staff)/staff/counter/intakeActions'
import { IntakeForm } from '@/components/counter/intake/IntakeForm'
import { IntakeStepNav } from '@/components/counter/intake/IntakeStepNav'
import { IntakeSummary } from '@/components/counter/intake/IntakeSummary'
import { PageHeader } from '@/components/layout/PageHeader'
import { NoPermission } from '@/components/staff/NoPermission'
import { mayUseCounter } from '@/features/counter/counterAccess'
import {
  currentTakeStep,
  type TakeStep,
  takeStepLinks,
} from '@/features/counter/intake/intakeSteps'
import { type CounterIntakeView, loadCounterIntake } from '@/features/counter/intake/intakeView'
import { listDocuments } from '@/features/documents/listDocuments'
import {
  type ApplicationPayments,
  loadApplicationPayments,
} from '@/features/payments/applicationPayments'
import { townTimeZone } from '@/features/town/timeZone'
import { requireStaffContext, type StaffContext } from '@/server/requireStaff'
import { isUuid } from '@/utils/uuid'
import { DocumentsStep } from './documentsStep'
import { DoneStep, FeeStep } from './finishSteps'
import { SubmitStep } from './submitStep'

export const metadata: Metadata = { title: 'Take an application' }

export const dynamic = 'force-dynamic'

const DOCUMENT_LIMIT = 100

interface Props {
  params: Promise<{ applicationId: string }>
  searchParams: Promise<{ step?: string }>
}

const LEADS: Record<TakeStep, string> = {
  form: 'Fill in the application with the applicant. Staff-only questions are shown too.',
  documents: 'Scan or upload what the applicant brought.',
  submit: 'Confirm the applicant signed the paper attestation, then submit.',
  fee: 'Take the fee that is due now.',
  done: 'The application is in the review queue.',
  withdrawn: 'This unfinished application was discarded.',
}

async function stepBody(
  ctx: StaffContext,
  view: CounterIntakeView,
  current: { step: TakeStep; payments: ApplicationPayments | null },
): Promise<ReactNode> {
  const { step, payments } = current
  if (step === 'form') {
    return (
      <IntakeForm
        applicationId={view.applicationId}
        form={view.form}
        initialValues={view.values}
        save={saveIntakeAction}
      />
    )
  }
  if (step === 'documents') {
    const record = { kind: 'application' as const, id: view.applicationId }
    const docs = await listDocuments(
      ctx.db,
      ctx.actor,
      { record, limit: DOCUMENT_LIMIT },
      ctx.signal,
    )
    return <DocumentsStep applicationId={view.applicationId} documents={docs.rows} />
  }
  if (step === 'submit') return <SubmitStep view={view} />
  if (step === 'fee') {
    return payments === null ? (
      <DoneStep view={view} />
    ) : (
      <FeeStep view={view} payments={payments} />
    )
  }
  if (step === 'done') return <DoneStep view={view} />
  return <p role="status">{`${view.number} was discarded and withdrawn.`}</p>
}

export default async function TakeApplicationPage({ params, searchParams }: Props) {
  const [{ applicationId }, { step: requested }] = await Promise.all([params, searchParams])
  if (!isUuid(applicationId)) notFound()
  const ctx = await requireStaffContext()
  if (!(await mayUseCounter(ctx.db, ctx.actor, ctx.signal))) {
    return <NoPermission title="Counter" action="take applications at the counter" />
  }
  const [view, zone] = await Promise.all([
    loadCounterIntake(ctx.db, applicationId, ctx.signal),
    townTimeZone(ctx.db, ctx.signal),
  ])
  if (view === null) notFound()
  const payments =
    view.state === 'draft'
      ? null
      : await loadApplicationPayments(ctx.db, ctx.actor, applicationId, ctx.signal)
  const step = currentTakeStep({
    state: view.state,
    payTiming: view.payTiming,
    dueCents: payments?.balance.dueCents ?? 0,
    requested,
  })
  return (
    <main>
      <PageHeader
        kicker="Counter"
        title={view.typeLabel}
        lead={LEADS[step]}
        summary={<IntakeSummary view={view} zone={zone} />}
      />
      {step === 'withdrawn' ? null : (
        <IntakeStepNav
          applicationId={applicationId}
          steps={takeStepLinks(view.payTiming)}
          current={step}
          draft={view.state === 'draft'}
        />
      )}
      {await stepBody(ctx, view, { step, payments })}
    </main>
  )
}
