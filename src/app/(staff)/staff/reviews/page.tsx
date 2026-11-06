import type { Metadata } from 'next'
import { FilterTabs } from '@/components/dataTable/FilterTabs'
import { ReviewSortBar, ReviewTable } from '@/components/reviews/ReviewTable'
import { NoPermission } from '@/components/staff/NoPermission'
import type { RawSearchParams } from '@/features/dataTable/params'
import { filterTabs, labeledOptions } from '@/features/dataTable/quickFilters'
import { sortLinks } from '@/features/dataTable/sort'
import {
  listReviewTable,
  REVIEW_SORT,
  REVIEW_TAB_LABELS,
  REVIEWS_PATH,
  type ReviewTab,
  readReviewView,
} from '@/features/reviews/reviewList'
import { mayOpen } from '@/features/staffNav/navItems'
import { loadNavViewer } from '@/features/staffNav/viewer'
import { requireStaffContext } from '@/server/requireStaff'

export const metadata: Metadata = { title: 'Your reviews' }

export const dynamic = 'force-dynamic'

const EMPTY: Readonly<Record<ReviewTab, string>> = {
  open: 'No reviews are waiting on you. New assignments show up here.',
  signed_off: 'You have not signed off on any review yet.',
  closed: 'No application finished before you signed off.',
}

export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>
}) {
  const { params, tab, sort } = readReviewView(await searchParams)
  const ctx = await requireStaffContext()
  if (!mayOpen(REVIEWS_PATH, await loadNavViewer(ctx.db, ctx.actor, ctx.signal))) {
    return <NoPermission title="Your reviews" action="see reviews" />
  }
  const list = await listReviewTable(ctx.db, ctx.actor, { tab, sort }, ctx.signal)
  const links = sortLinks(REVIEWS_PATH, params, REVIEW_SORT, sort)
  const tabs = filterTabs(REVIEWS_PATH, params, {
    param: 'tab',
    label: 'Reviews',
    defaultTab: 'open',
    options: labeledOptions(REVIEW_TAB_LABELS, list.counts),
  })
  return (
    <main data-wide="">
      <h1>Your reviews</h1>
      <p>
        Applications assigned to you for review, comments due soonest first. Open a review to read
        the documents, comment and sign off.
      </p>
      <FilterTabs label="Reviews" tabs={tabs} />
      <div className="toolbar sm:hidden">
        <ReviewSortBar links={links} />
      </div>
      <ReviewTable
        rows={list.rows}
        links={links}
        empty={<p className="px-5 py-8">{EMPTY[tab]}</p>}
      />
    </main>
  )
}
