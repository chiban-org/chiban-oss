import { eq } from 'drizzle-orm'
import type { ReactNode } from 'react'
import { CounterParcelSearch } from '@/components/counter/CounterParcelSearch'
import { type ChosenStep, ChosenSteps } from '@/components/counter/CounterSteps'
import { QuickIssueForm } from '@/components/counter/QuickIssueForm'
import { parcels } from '@/db/schema'
import { loadCounterFormData } from '@/features/counter/counterFormData'
import type { DirectIssueType } from '@/features/counter/directIssueTypes'
import {
  defaultLicenseType,
  licenseGroups,
  licenseLookup,
} from '@/features/licenseChecks/packLicenses'
import { displayIdsFor } from '@/features/parcels/displayId'
import { searchExample } from '@/features/parcels/searchExample'
import { searchParcels } from '@/features/parcels/searchParcels'
import type { StaffContext } from '@/server/requireStaff'
import { completeAction, quickIssueAction, sendClaimAction } from './actions'
import { lookupContractorAction } from './contractorLookupAction'
import { COUNTER_START, counterHref } from './counterHref'
import { checkAction, readerAction, reconnectAction } from './readerActions'

const actions = {
  issue: quickIssueAction,
  claim: sendClaimAction,
  reader: readerAction,
  check: checkAction,
  reconnect: reconnectAction,
  complete: completeAction,
  lookupContractor: lookupContractorAction,
}

export async function parcelLabel(ctx: StaffContext, parcelId: string): Promise<string> {
  const [display, [row]] = await Promise.all([
    displayIdsFor(ctx.db, [parcelId]),
    ctx.db
      .select({ siteAddress: parcels.siteAddress })
      .from(parcels)
      .where(eq(parcels.id, parcelId)),
  ])
  return `${display.get(parcelId) ?? 'No map-lot ID'}, ${row?.siteAddress ?? 'No site address'}`
}

export async function issueStep(
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
    { label: 'Permit type', value: type.label, changeHref: COUNTER_START },
    { label: 'Parcel', value: label, changeHref: counterHref({ q, type: type.key }) },
  ]
  if (formData === null) {
    return (
      <>
        <ChosenSteps steps={steps} />
        <p role="alert">
          This permit type has no form in use or a fee that cannot be worked out yet.
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
      licenseGroups={licenseGroups()}
      defaultLicenseType={defaultLicenseType(type.key)}
      lookup={licenseLookup()}
      actions={actions}
      {...formData}
    />
  )
}

export async function parcelStep(
  ctx: StaffContext,
  type: { key: string; label: string; stepLabel: string },
  q: string,
): Promise<ReactNode> {
  const [example, hits] = await Promise.all([
    searchExample(ctx.db, ctx.signal),
    q.trim().length >= 2 ? searchParcels(ctx.db, { q }, ctx.signal) : Promise.resolve([]),
  ])
  return (
    <>
      <ChosenSteps
        steps={[{ label: type.stepLabel, value: type.label, changeHref: COUNTER_START }]}
      />
      <CounterParcelSearch
        q={q}
        typeKey={type.key}
        hits={hits}
        example={example}
        userId={ctx.actor.userId}
        hrefFor={(id) => counterHref({ q, parcel: id, type: type.key })}
      />
    </>
  )
}
