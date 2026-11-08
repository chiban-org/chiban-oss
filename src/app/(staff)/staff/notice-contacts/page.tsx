import type { Metadata } from 'next'
import Link from 'next/link'
import { Fragment } from 'react'
import { FilterTabs } from '@/components/dataTable/FilterTabs'
import { KeyFacts } from '@/components/layout/KeyFacts'
import { ListHeader } from '@/components/layout/ListHeader'
import { NoPermission } from '@/components/staff/NoPermission'
import type { RawSearchParams, TableParams } from '@/features/dataTable/params'
import { pickedParcelFor } from '@/features/parcels/parcelPick'
import { contactTabs } from '@/features/rosters/contactChips'
import {
  DUE_PARAM,
  DUE_VALUE,
  type EntryTab,
  readContactsQuery,
  tabHref,
} from '@/features/rosters/contactListParams'
import { RECHECK_NOTE } from '@/features/rosters/recheck'
import { loadRostersView, type RostersView } from '@/features/rosters/rosterView'
import { requireStaffContext } from '@/server/requireStaff'
import { isUuid } from '@/utils/uuid'
import { EntrySection, NOTICE_CONTACTS_LEAD } from './ContactSections'
import { GapsSection, RegionalSection } from './OtherSections'
import { RecheckInterval } from './RecheckInterval'

export const metadata: Metadata = { title: 'Notice contacts' }

export const dynamic = 'force-dynamic'

function counted(count: number, [one, many]: readonly [string, string]): string {
  return `${count} ${count === 1 ? one : many}`
}

function separator(index: number, length: number): string {
  if (index === 0) return ''
  return index === length - 1 ? ' and ' : ', '
}

function dueParts(view: RostersView): { tab: EntryTab; text: string }[] {
  const { associations, parks, holders } = view.totals
  const parts: { tab: EntryTab; due: number; nouns: [string, string] }[] = [
    { tab: 'associations', due: associations.due, nouns: ['association', 'associations'] },
    { tab: 'parks', due: parks.due, nouns: ['park', 'parks'] },
    { tab: 'holders', due: holders.due, nouns: ['restriction holder', 'restriction holders'] },
  ]
  return parts
    .filter((part) => part.due > 0)
    .map((part) => ({ tab: part.tab, text: counted(part.due, part.nouns) }))
}

function DueLinks({ view }: { view: RostersView }) {
  const due = dueParts(view)
  if (due.length === 0) return null
  return (
    <p className="m-0">
      <span className="attention font-semibold">Due for a check:</span>{' '}
      {due.map((part, index) => (
        <Fragment key={part.tab}>
          {separator(index, due.length)}
          <Link href={tabHref(part.tab, { [DUE_PARAM]: DUE_VALUE })}>{part.text}</Link>
        </Fragment>
      ))}
      .
    </p>
  )
}

function Facts({ view }: { view: RostersView }) {
  return (
    <KeyFacts note={RECHECK_NOTE}>
      <DueLinks view={view} />
      {view.gapCount === 0 ? null : (
        <p className="m-0">
          {'No association on file for '}
          <Link href={tabHref('missing')}>
            {counted(view.gapCount, ['condo parcel', 'condo parcels'])}
          </Link>
          .
        </p>
      )}
      <RecheckInterval days={view.recheckDays} canEdit={view.canEditSettings} />
    </KeyFacts>
  )
}

async function prefilledParcel(
  params: TableParams,
  ctx: Awaited<ReturnType<typeof requireStaffContext>>,
) {
  const parcel = params.get('parcel')?.[0] ?? ''
  if (params.get('add')?.[0] !== 'association' || !isUuid(parcel)) return null
  return await pickedParcelFor(ctx.db, parcel, ctx.signal)
}

export default async function NoticeContactsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>
}) {
  const { params, query } = readContactsQuery(await searchParams)
  const ctx = await requireStaffContext()
  const view = await loadRostersView(ctx.db, ctx.actor, ctx.signal, { query })
  if (view === null) {
    return <NoPermission title="Notice contacts" action="keep the notice contacts" />
  }
  const prefill = await prefilledParcel(params, ctx)
  return (
    <main data-wide="">
      <ListHeader title="Notice contacts" lead={NOTICE_CONTACTS_LEAD} />
      <Facts view={view} />
      <FilterTabs
        label="Kinds of notice contact"
        tabs={contactTabs(view.query.tab, view.totals, view.gapCount)}
      />
      {view.list === null ? null : (
        <EntrySection view={view} list={view.list} params={params} prefill={prefill} />
      )}
      {view.query.tab === 'missing' ? <GapsSection view={view} params={params} /> : null}
      {view.query.tab === 'regional' ? <RegionalSection view={view} /> : null}
    </main>
  )
}
