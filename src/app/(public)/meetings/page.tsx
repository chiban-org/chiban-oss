import type { Metadata } from 'next'
import { PublicPager } from '@/components/public/PublicPager'
import { db } from '@/db/client'
import { loadPastMeetings, loadUpcomingMeetings } from '@/features/hearings/publicMeetings'
import { loadPublicDecisions } from '@/features/hearings/publicRecords'
import { townToday } from '@/features/town/today'
import { DecisionRow, PastRow, UpcomingRow } from './sections'

export const metadata: Metadata = { title: 'Meetings' }

export const dynamic = 'force-dynamic'

const TIMEOUT_MS = 10_000
const PAGE = /^[1-9]\d{0,5}$/

type Param = string | string[] | undefined

interface Props {
  searchParams: Promise<{ past?: Param; decisions?: Param }>
}

function pageFrom(value: Param): number {
  return typeof value === 'string' && PAGE.test(value) ? Number(value) : 1
}

function hrefWith(pages: { past: number; decisions: number }): string {
  const params = new URLSearchParams()
  if (pages.past > 1) params.set('past', String(pages.past))
  if (pages.decisions > 1) params.set('decisions', String(pages.decisions))
  const query = params.toString()
  return query === '' ? '/meetings' : `/meetings?${query}`
}

export default async function PublicMeetingsPage({ searchParams }: Props) {
  const params = await searchParams
  const pages = { past: pageFrom(params.past), decisions: pageFrom(params.decisions) }
  const signal = AbortSignal.timeout(TIMEOUT_MS)
  const today = await townToday(db, new Date(), signal)
  const [upcoming, past, decisions] = await Promise.all([
    loadUpcomingMeetings(db, today, signal),
    loadPastMeetings(db, { today, page: pages.past }, signal),
    loadPublicDecisions(db, { page: pages.decisions }, signal),
  ])
  return (
    <main>
      <h1>Meetings</h1>
      <p>
        Town board meetings are open to the public. Agendas, minutes and notices of decision open in
        a new tab.
      </p>
      <section aria-labelledby="upcoming-heading">
        <h2 id="upcoming-heading">Upcoming meetings</h2>
        {upcoming.length === 0 ? <p>No meetings are scheduled yet.</p> : null}
        <ul className="list-none p-0">
          {upcoming.map((m) => (
            <UpcomingRow key={m.meetingId} meeting={m} />
          ))}
        </ul>
      </section>
      <section aria-labelledby="past-heading">
        <h2 id="past-heading">Past meetings and minutes</h2>
        {past.meetings.length === 0 ? <p>No past agendas or minutes are posted yet.</p> : null}
        <ul className="list-none p-0">
          {past.meetings.map((m) => (
            <PastRow key={m.meetingId} meeting={m} />
          ))}
        </ul>
        <PublicPager
          label="Past meeting pages"
          {...past.page}
          hrefFor={(page) => `${hrefWith({ ...pages, past: page })}#past-heading`}
          newer="Newer meetings"
          older="Older meetings"
        />
      </section>
      <section aria-labelledby="decisions-heading">
        <h2 id="decisions-heading">Decisions</h2>
        {decisions.decisions.length === 0 ? <p>No decisions have been filed yet.</p> : null}
        <ul className="list-none p-0">
          {decisions.decisions.map((d) => (
            <DecisionRow key={d.decisionId} decision={d} />
          ))}
        </ul>
        <PublicPager
          label="Decision pages"
          {...decisions.page}
          hrefFor={(page) => `${hrefWith({ ...pages, decisions: page })}#decisions-heading`}
          newer="Newer decisions"
          older="Older decisions"
        />
      </section>
    </main>
  )
}
