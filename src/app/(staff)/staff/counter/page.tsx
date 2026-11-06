import { NH_LICENSE_TYPES, nhDefaultLicenseType } from '@packs/nh/licenseTypes'
import { NH_LICENSE_LOOKUP } from '@packs/nh/links'
import { eq } from 'drizzle-orm'
import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { CounterParcelSearch } from '@/components/counter/CounterParcelSearch'
import { type ChosenStep, ChosenSteps, TypeTiles } from '@/components/counter/CounterSteps'
import { QuickIssueForm } from '@/components/counter/QuickIssueForm'
import { PageHeader } from '@/components/layout/PageHeader'
import { NoPermission } from '@/components/staff/NoPermission'
import { parcels } from '@/db/schema'
import { hasCapability } from '@/features/authz/capabilities'
import { loadCounterFormData } from '@/features/counter/counterFormData'
import { type DirectIssueType, listDirectIssueTypes } from '@/features/counter/directIssueTypes'
import { displayIdsFor } from '@/features/parcels/displayId'
import { searchExample } from '@/features/parcels/searchExample'
import { searchParcels } from '@/features/parcels/searchParcels'
import { requireStaffContext, type StaffContext } from '@/server/requireStaff'
import { isUuid } from '@/utils/uuid'
import { completeAction, quickIssueAction, sendClaimAction } from './actions'
import { checkAction, readerAction, reconnectAction } from './readerActions'

export const metadata: Metadata = { title: 'Counter' }

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ q?: string; parcel?: string; type?: string }>
}

const actions = {
  issue: quickIssueAction,
  claim: sendClaimAction,
  reader: readerAction,
  check: checkAction,
  reconnect: reconnectAction,
  complete: completeAction,
}

const START = '/staff/counter'

const LICENSE_GROUPS = NH_LICENSE_TYPES.map((group) => ({
  label: group.label,
  licenses: group.licenses,
}))

function href(params: Record<string, string | undefined>): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query.set(key, value)
  }
  return `${START}?${query.toString()}`
}

const LEADS = {
  type: 'Choose the permit type, then find the parcel.',
  parcel: 'Find the parcel the permit is for.',
  form: 'Fill in the details, take payment, then issue and print the permit.',
} as const

function Header({ step }: { step: keyof typeof LEADS }) {
  return <PageHeader title="Counter" lead={LEADS[step]} />
}

function OtherApplications() {
  return (
    <p>
      Other permits and applications are started by the applicant in the{' '}
      <Link href="/portal/apply">online portal</Link>.
    </p>
  )
}

async function parcelLabel(ctx: StaffContext, parcelId: string): Promise<string> {
  const [display, [row]] = await Promise.all([
    displayIdsFor(ctx.db, [parcelId]),
    ctx.db
      .select({ siteAddress: parcels.siteAddress })
      .from(parcels)
      .where(eq(parcels.id, parcelId)),
  ])
  return `${display.get(parcelId) ?? 'No map-lot ID'}, ${row?.siteAddress ?? 'No site address'}`
}

async function issueStep(
  ctx: StaffContext,
  type: DirectIssueType,
  parcelId: string,
  q: string,
): Promise<ReactNode> {
  const [formData, label] = await Promise.all([
    loadCounterFormData(ctx.db, type.key, ctx.signal),
    parcelLabel(ctx, parcelId),
  ])
  const steps: ChosenStep[] = [
    { label: 'Permit type', value: type.label, changeHref: START },
    { label: 'Parcel', value: label, changeHref: href({ q, type: type.key }) },
  ]
  if (formData === null) {
    return (
      <>
        <ChosenSteps steps={steps} />
        <p role="alert">
          This permit type has no published form or a fee that cannot be worked out yet.
        </p>
      </>
    )
  }
  return (
    <QuickIssueForm
      key={`${type.key}:${parcelId}`}
      parcelId={parcelId}
      typeKey={type.key}
      typeLabel={type.label}
      parcelLabel={label}
      summary={<ChosenSteps steps={steps} />}
      licenseRequired={type.requiresLicense}
      licenseGroups={LICENSE_GROUPS}
      defaultLicenseType={nhDefaultLicenseType(type.key)}
      lookup={NH_LICENSE_LOOKUP}
      actions={actions}
      {...formData}
    />
  )
}

async function parcelStep(ctx: StaffContext, type: DirectIssueType, q: string): Promise<ReactNode> {
  const [example, hits] = await Promise.all([
    searchExample(ctx.db, ctx.signal),
    q.trim().length >= 2 ? searchParcels(ctx.db, { q }, ctx.signal) : Promise.resolve([]),
  ])
  return (
    <>
      <ChosenSteps steps={[{ label: 'Permit type', value: type.label, changeHref: START }]} />
      <CounterParcelSearch
        q={q}
        typeKey={type.key}
        hits={hits}
        example={example}
        userId={ctx.actor.userId}
        hrefFor={(id) => href({ q, parcel: id, type: type.key })}
      />
    </>
  )
}

export default async function CounterPage({ searchParams }: Props) {
  const { q = '', parcel, type } = await searchParams
  const ctx = await requireStaffContext()
  const allowed =
    (await hasCapability(ctx.db, ctx.actor.userId, 'permit.issue', ctx.signal)) &&
    (await hasCapability(ctx.db, ctx.actor.userId, 'payment.collect', ctx.signal))
  if (!allowed) return <NoPermission title="Counter" action="issue permits at the counter" />
  const types = await listDirectIssueTypes(ctx.db, ctx.signal)
  const selectedType = types.find((t) => t.key === type)
  const parcelId = parcel !== undefined && isUuid(parcel) ? parcel : undefined

  if (selectedType === undefined) {
    return (
      <main>
        <Header step="type" />
        <TypeTiles types={types} hrefFor={(key) => href({ q, parcel: parcelId, type: key })} />
        <OtherApplications />
      </main>
    )
  }
  const step =
    parcelId === undefined
      ? await parcelStep(ctx, selectedType, q)
      : await issueStep(ctx, selectedType, parcelId, q)
  return (
    <main>
      <Header step={parcelId === undefined ? 'parcel' : 'form'} />
      {step}
    </main>
  )
}
