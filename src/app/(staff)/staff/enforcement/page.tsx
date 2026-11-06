import type { Metadata } from 'next'
import { ActionForm } from '@/components/ActionForm'
import { QuickFilters } from '@/components/dataTable/QuickFilters'
import { TablePager } from '@/components/dataTable/TablePager'
import { EnforcementQueueTable } from '@/components/enforcement/EnforcementQueueTable'
import { FormDialog } from '@/components/FormDialog'
import { ListHeader } from '@/components/layout/ListHeader'
import { ParcelPicker } from '@/components/parcels/picker/ParcelPicker'
import { TextField } from '@/components/staff/fields'
import { NoPermission } from '@/components/staff/NoPermission'
import { hasCapability } from '@/features/authz/capabilities'
import { clearHref, pageHref, type RawSearchParams, readOffset } from '@/features/dataTable/params'
import { sortLinks } from '@/features/dataTable/sort'
import { caseListFacets } from '@/features/enforcement/caseList'
import { caseChipGroups } from '@/features/enforcement/caseListChips'
import {
  CASE_FILTER_PARAMS,
  CASE_SORT,
  CASES_PATH,
  readCasesView,
} from '@/features/enforcement/caseListParams'
import { listCaseQueue } from '@/features/enforcement/caseQueue'
import { mayOpen } from '@/features/staffNav/navItems'
import { loadNavViewer } from '@/features/staffNav/viewer'
import { townToday } from '@/features/town/today'
import { requireStaffContext } from '@/server/requireStaff'
import { openCaseAction, staffComplaintAction } from './actions'

export const metadata: Metadata = { title: 'Code enforcement' }

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25

const PARCEL_HINT = 'Without one, Chiban links the parcel whose site address matches exactly.'

function NewCaseForms() {
  return (
    <>
      <FormDialog label="Open a case" title="Open a case" variant="default">
        <ActionForm action={openCaseAction} submitLabel="Open case">
          <TextField label="Where is the property?" name="locationText" required />
          <ParcelPicker label="Parcel, if known" name="parcelRef" hint={PARCEL_HINT} />
        </ActionForm>
      </FormDialog>
      <FormDialog
        label="Enter a complaint"
        title="Enter a complaint taken by phone or at the counter"
        description="Entering a complaint opens a case for it."
      >
        <ActionForm action={staffComplaintAction} submitLabel="Record complaint">
          <TextField label="Where is the property?" name="locationText" required />
          <TextField label="What was reported?" name="description" required />
          <ParcelPicker label="Parcel, if known" name="parcelRef" hint={PARCEL_HINT} />
        </ActionForm>
      </FormDialog>
    </>
  )
}

export default async function EnforcementQueuePage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>
}) {
  const { params, sort, filters } = readCasesView(await searchParams)
  const ctx = await requireStaffContext()
  if (!mayOpen(CASES_PATH, await loadNavViewer(ctx.db, ctx.actor, ctx.signal))) {
    return <NoPermission title="Code enforcement" action="see code enforcement cases" />
  }
  const today = await townToday(ctx.db, new Date(), ctx.signal)
  const [queue, facets, canManage] = await Promise.all([
    listCaseQueue(
      ctx.db,
      ctx.actor,
      { filters, sort, limit: PAGE_SIZE, offset: readOffset(params) },
      today,
      ctx.signal,
    ),
    caseListFacets(ctx.db, ctx.actor, { filters }, today, ctx.signal),
    hasCapability(ctx.db, ctx.actor.userId, 'enforcement.manage', ctx.signal),
  ])
  const links = sortLinks(CASES_PATH, params, CASE_SORT, sort)
  const clear = clearHref(CASES_PATH, params, CASE_FILTER_PARAMS)
  const pageLink = (offset: number | null) =>
    offset === null ? null : pageHref(CASES_PATH, params, String(offset))
  return (
    <main data-wide="">
      <ListHeader
        title="Code enforcement"
        lead="Newest case first."
        actions={canManage ? <NewCaseForms /> : null}
      />
      <div className="toolbar">
        <QuickFilters
          label="Quick filters"
          groups={caseChipGroups(params, facets)}
          clearHref={clear}
        />
      </div>
      <div className="table-panel">
        <EnforcementQueueTable rows={queue.rows} links={links} />
      </div>
      <TablePager
        offset={queue.offset}
        shown={queue.rows.length}
        total={queue.total}
        prevHref={pageLink(queue.prevOffset)}
        nextHref={pageLink(queue.nextOffset)}
      />
    </main>
  )
}
