import Link from 'next/link'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

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
      <Task href="/staff" title="Open the staff site">
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

export function HomeContent({
  audience,
  boardMember = false,
}: {
  audience: HomeAudience
  boardMember?: boolean
}) {
  return (
    <main className="mx-auto max-w-3xl">
      <div className="border-b pb-10">
        <p className="text-sm font-semibold text-muted-foreground">Land use records</p>
        <h1 className="mt-2 text-6xl">Town of Alder Pond</h1>
        <p className="mt-3 max-w-[60ch] text-lg text-ink-secondary">
          Find a parcel, see its permits and applications, and track what the town has on file.
        </p>
        <form action="/parcels" method="get" role="search" className="mt-6 flex flex-wrap gap-3">
          <Label htmlFor="home-parcel-search" className="sr-only">
            Address, owner, or parcel ID
          </Label>
          <Input
            id="home-parcel-search"
            name="q"
            placeholder="Address, owner, or parcel ID"
            className="h-11 flex-1 px-4 text-base md:text-base"
          />
          <Button type="submit" size="lg" className="h-11 text-base font-semibold">
            Search parcels
          </Button>
        </form>
      </div>
      <ul className="mt-10 divide-y">
        {boardMember ? (
          <Task href="/board" title="Board meetings">
            Read the agenda and packet for each meeting of your board.
          </Task>
        ) : null}
        <Task href="/parcels" title="Look up a parcel">
          See the permits, applications, and board decisions on file for any parcel in town.
        </Task>
        <Task href="/meetings" title="Board agendas and decisions">
          Upcoming Planning Board and Zoning Board meetings, their agendas, and filed decisions.
        </Task>
        <Task href="/complaints/new" title="Report a possible violation">
          Tell the town about building or land use work that may not follow the rules.
        </Task>
        <AccountTask audience={audience} />
      </ul>
    </main>
  )
}
