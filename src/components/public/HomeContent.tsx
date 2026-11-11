import Link from 'next/link'
import type { ReactNode } from 'react'
import { ParcelSearch } from '@/components/public/ParcelSearch'
import type { SearchExample } from '@/features/parcels/searchExample'

export type HomeAudience = 'visitor' | 'resident' | 'staff'

const TASK_LINK =
  'tap-target inline-flex items-center font-serif text-2xl font-semibold no-underline hover:underline'

function Task({ href, title, children }: { href: string; title: string; children: ReactNode }) {
  return (
    <li className="flex flex-col gap-1 py-6 first:pt-0 last:pb-0">
      <Link href={href} className={TASK_LINK}>
        {title}
      </Link>
      <p className="max-w-[60ch] text-ink-secondary">{children}</p>
    </li>
  )
}

function AccountTask({ audience }: { audience: HomeAudience }) {
  if (audience === 'resident') {
    return (
      <Task href="/portal" title="Your applications">
        Check where each application stands, pay fees, and request inspections.
      </Task>
    )
  }
  if (audience === 'staff') {
    return (
      <Task href="/staff" title="Staff site">
        The counter, applications, boards, inspections, and records.
      </Task>
    )
  }
  return (
    <Task href="/sign-in" title="Sign in to see your applications">
      Applicants and contractors sign in with an emailed link. No password needed.
    </Task>
  )
}

interface HomeContentProps {
  audience: HomeAudience
  townName: string
  example: SearchExample | null
  boardMember?: boolean
}

export function HomeContent({
  audience,
  townName,
  example,
  boardMember = false,
}: HomeContentProps) {
  return (
    <main className="mx-auto max-w-3xl">
      <div className="flex flex-col gap-6 border-b pb-10">
        <div>
          <p className="text-sm font-semibold text-muted-foreground">Land use records</p>
          <h1 className="mt-2 text-5xl md:text-6xl">{townName}</h1>
          <p className="mt-3 max-w-[60ch] text-lg text-ink-secondary">
            Find a parcel, see its permits and applications, and track what the town has on file.
          </p>
        </div>
        <ParcelSearch example={example} />
      </div>
      <ul className="mt-10 divide-y">
        {boardMember ? (
          <Task href="/board" title="Your board">
            Read the agenda and packet for each meeting of your board.
          </Task>
        ) : null}
        <Task href="/portal/apply" title="Apply for a permit">
          Start a building, trade, or land use application online and pay its fees.
        </Task>
        <Task href="/meetings" title="Meetings">
          Upcoming Planning Board and Zoning Board meetings, their agendas, minutes, and decisions.
        </Task>
        <Task href="/complaints/new" title="Report a problem">
          Tell the town about building or land use work that may not follow the rules.
        </Task>
        <Task href="/records/request" title="Ask for town records">
          Make a Right-to-Know request for public records the town keeps.
        </Task>
        <AccountTask audience={audience} />
      </ul>
    </main>
  )
}
