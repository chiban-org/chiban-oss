import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { TypeTiles } from '@/components/counter/CounterSteps'
import { UnfinishedIntakes } from '@/components/counter/intake/UnfinishedIntakes'
import { PageHeader } from '@/components/layout/PageHeader'
import { NoPermission } from '@/components/staff/NoPermission'
import { mayUseCounter } from '@/features/counter/counterAccess'
import { type CounterTypes, listCounterTypes } from '@/features/counter/directIssueTypes'
import { listUnfinishedIntakes } from '@/features/counter/intake/unfinished'
import { townTimeZone } from '@/features/town/timeZone'
import { requireStaffContext, type StaffContext } from '@/server/requireStaff'
import { isUuid } from '@/utils/uuid'
import { counterHref } from './counterHref'
import { discardIntakeAction } from './intakeActions'
import { applicantStep, REVIEW_STEP_LABEL } from './intakeSteps'
import { issueStep, parcelStep } from './issueSteps'

export const metadata: Metadata = { title: 'Counter' }

export const dynamic = 'force-dynamic'

interface Params {
  q?: string
  parcel?: string
  type?: string
  applicant?: string
}

interface Props {
  searchParams: Promise<Params>
}

const LEADS = {
  type: 'Choose what the applicant came in for, then find the parcel.',
  parcel: 'Find the parcel the permit is for.',
  form: 'Fill in the details, take payment, then issue and print the permit.',
  reviewParcel: 'Find the parcel the application is for.',
  applicant: 'Find the applicant, then take the application with them.',
} as const

function Header({ step }: { step: keyof typeof LEADS }) {
  return <PageHeader title="Counter" lead={LEADS[step]} />
}

async function startStep(ctx: StaffContext, types: CounterTypes, params: Params) {
  const [unfinished, zone] = await Promise.all([
    listUnfinishedIntakes(ctx.db, ctx.signal),
    townTimeZone(ctx.db, ctx.signal),
  ])
  const parcel = params.parcel !== undefined && isUuid(params.parcel) ? params.parcel : undefined
  const hrefFor = (key: string) => counterHref({ q: params.q, parcel, type: key })
  return (
    <main className="flex flex-col gap-8">
      <Header step="type" />
      <UnfinishedIntakes rows={unfinished} zone={zone} discard={discardIntakeAction} />
      <TypeTiles
        id="issue-today"
        title="Issue today"
        lead="Issued and printed while the applicant waits."
        emptyText="No permit type is set up for counter issue."
        types={types.issueToday}
        hrefFor={hrefFor}
      />
      <TypeTiles
        id="take-for-review"
        title="Take for review"
        lead="Taken now and sent on for staff or board review, the same as an application filed online."
        emptyText="No other application type is in use."
        types={types.takeForReview}
        hrefFor={hrefFor}
      />
    </main>
  )
}

async function chosenStep(
  ctx: StaffContext,
  types: CounterTypes,
  params: Params,
): Promise<{ step: keyof typeof LEADS; body: ReactNode } | null> {
  const q = params.q ?? ''
  const parcelId = params.parcel !== undefined && isUuid(params.parcel) ? params.parcel : undefined
  const direct = types.issueToday.find((t) => t.key === params.type)
  if (direct !== undefined) {
    return parcelId === undefined
      ? { step: 'parcel', body: await parcelStep(ctx, { ...direct, stepLabel: 'Permit type' }, q) }
      : { step: 'form', body: await issueStep(ctx, direct, parcelId, q) }
  }
  const review = types.takeForReview.find((t) => t.key === params.type)
  if (review === undefined) return null
  if (parcelId === undefined) {
    const body = await parcelStep(ctx, { ...review, stepLabel: REVIEW_STEP_LABEL }, q)
    return { step: 'reviewParcel', body }
  }
  const applicant = params.applicant ?? ''
  return { step: 'applicant', body: await applicantStep(ctx, review, { parcelId, q, applicant }) }
}

export default async function CounterPage({ searchParams }: Props) {
  const params = await searchParams
  const ctx = await requireStaffContext()
  if (!(await mayUseCounter(ctx.db, ctx.actor, ctx.signal))) {
    return <NoPermission title="Counter" action="issue permits at the counter" />
  }
  const types = await listCounterTypes(ctx.db, ctx.signal)
  const chosen = await chosenStep(ctx, types, params)
  if (chosen === null) return await startStep(ctx, types, params)
  return (
    <main>
      <Header step={chosen.step} />
      {chosen.body}
    </main>
  )
}
