import Link from 'next/link'
import type { ReactNode } from 'react'
import { ActionForm } from '@/components/ActionForm'
import { TablePager } from '@/components/dataTable/TablePager'
import { SectionHeader } from '@/components/layout/ListHeader'
import { StatusChip } from '@/components/StatusChip'
import { pagerLinks } from '@/features/dataTable/pageSlice'
import { clearHref, type TableParams } from '@/features/dataTable/params'
import { sortLinks } from '@/features/dataTable/sort'
import type { PickedParcel } from '@/features/parcels/parcelPick'
import { CONTACT_FILTER_PARAMS, CONTACT_SORT } from '@/features/rosters/contactListParams'
import type { ContactList } from '@/features/rosters/contactPage'
import { NOTICE_CONTACTS_PATH } from '@/features/rosters/links'
import type { RostersView } from '@/features/rosters/rosterView'
import { AddAssociation } from './AssociationForms'
import { recordLandRecordsCheckAction } from './actions'
import { RestrictionTable } from './ContactTables'
import { ContactToolbar, PinnedEntryNote } from './ContactToolbar'
import { AddHolder } from './HolderForms'
import { AddPark } from './ParkForms'
import { AssociationTable, ParkTable } from './RosterTables'

export const NOTICE_CONTACTS_LEAD =
  'People who get mailed notice instead of, or as well as, the parcel owner.'

export const SECTION_LINES = {
  associations: 'Notices for a condo parcel go to the association officers, not the unit owners.',
  parks:
    'Notices go to the park owner. Each tenant is listed and you decide per application whether their home is adjoining or across.',
  gaps: 'An abutter list that touches one of these cannot be issued until its association is added.',
  restrictions: "When an applicant's land carries one of these, the holder is notified.",
  regional:
    'Used only when an application has regional impact or is within 500 feet under NH DES rules.',
} as const

interface SectionCopy {
  id: string
  title: string
  lead: string
  noun: string
  addLabel: string
}

const COPY: Readonly<Record<ContactList['tab'], SectionCopy>> = {
  associations: {
    id: 'associations',
    title: 'Condo associations',
    lead: SECTION_LINES.associations,
    noun: 'associations',
    addLabel: 'Add association',
  },
  parks: {
    id: 'parks',
    title: 'Manufactured housing parks',
    lead: SECTION_LINES.parks,
    noun: 'parks',
    addLabel: 'Add park',
  },
  holders: {
    id: 'holders',
    title: 'Conservation and preservation restrictions',
    lead: SECTION_LINES.restrictions,
    noun: 'restriction holders',
    addLabel: 'Add holder',
  },
}

function LandRecords({ view }: { view: RostersView }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <p className="m-0 font-medium">{view.landRecords.text}</p>
      {view.landRecords.due ? <StatusChip status="overdue" label="Due for a check" /> : null}
      <ActionForm action={recordLandRecordsCheckAction} submitLabel="Record a check" compact>
        {null}
      </ActionForm>
    </div>
  )
}

function ListBody({
  list,
  view,
  params,
}: {
  list: ContactList
  view: RostersView
  params: TableParams
}) {
  const links = sortLinks(NOTICE_CONTACTS_PATH, params, CONTACT_SORT, view.query.sort)
  if (list.rows.length === 0) {
    const onFile = list.counts.active + list.counts.ended > 0 || view.query.search !== ''
    const copy = COPY[list.tab]
    if (!onFile) return <p>{`No ${copy.noun} on file. Add one with ${copy.addLabel}.`}</p>
    const clear = clearHref(NOTICE_CONTACTS_PATH, params, CONTACT_FILTER_PARAMS)
    return (
      <p>
        {`No ${copy.noun} match. `}
        {clear === null ? null : <Link href={clear}>Clear all</Link>}
      </p>
    )
  }
  if (list.tab === 'associations') {
    return <AssociationTable rows={list.rows} today={view.today} links={links} />
  }
  if (list.tab === 'parks') return <ParkTable rows={list.rows} today={view.today} links={links} />
  return <RestrictionTable rows={list.rows} today={view.today} links={links} />
}

function addAction(
  tab: ContactList['tab'],
  view: RostersView,
  prefill: PickedParcel | null,
): ReactNode {
  if (tab === 'associations') {
    return <AddAssociation today={view.today} parcel={prefill} open={prefill !== null} />
  }
  return tab === 'parks' ? <AddPark today={view.today} /> : <AddHolder />
}

export function EntrySection({
  view,
  list,
  params,
  prefill,
}: {
  view: RostersView
  list: ContactList
  params: TableParams
  prefill: PickedParcel | null
}) {
  const copy = COPY[list.tab]
  return (
    <section aria-labelledby={copy.id}>
      <SectionHeader
        id={copy.id}
        title={copy.title}
        lead={copy.lead}
        action={addAction(list.tab, view, prefill)}
      />
      {list.tab === 'holders' ? <LandRecords view={view} /> : null}
      <ContactToolbar params={params} query={view.query} counts={list.counts} />
      {view.query.entry === null ? null : <PinnedEntryNote tab={list.tab} />}
      <ListBody list={list} view={view} params={params} />
      <TablePager
        {...pagerLinks(NOTICE_CONTACTS_PATH, params, { ...list.window, rows: list.rows })}
      />
    </section>
  )
}
