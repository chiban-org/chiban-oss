import { redirect } from 'next/navigation'
import { HomeParcelSearch } from '@/components/staff/home/HomeParcelSearch'
import { HomeSectionPanel } from '@/components/staff/home/HomeSectionPanel'
import { searchExample } from '@/features/parcels/searchExample'
import { loadHomeSections } from '@/features/staffHome/loadHome'
import { startPageFor } from '@/features/staffHome/startPage'
import { loadNavViewer } from '@/features/staffNav/viewer'
import { townToday } from '@/features/town/today'
import { formatCivilDate } from '@/lib/formatDate'
import { requireStaffActor, requireStaffContext } from '@/server/requireStaff'

const TIMEOUT_MS = 10_000

export default async function StaffHome() {
  await requireStaffActor(AbortSignal.timeout(TIMEOUT_MS))
  const ctx = await requireStaffContext()
  const viewer = await loadNavViewer(ctx.db, ctx.actor, ctx.signal)
  const start = startPageFor(viewer)
  if (start.kind === 'redirect') redirect(start.to)
  const now = new Date()
  const today = await townToday(ctx.db, now, ctx.signal)
  const [sections, example] = await Promise.all([
    loadHomeSections({ ...ctx, viewer, today, now }, start.roles),
    searchExample(ctx.db, ctx.signal),
  ])
  return (
    <main>
      <header className="mb-8 flex flex-col gap-5 border-b pb-8">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-muted-foreground">{formatCivilDate(today)}</p>
          <h1>Today</h1>
        </div>
        <HomeParcelSearch userId={ctx.actor.userId} example={example} />
      </header>
      <div
        className={`grid gap-5 lg:items-start [&>section]:m-0 ${sections.length > 1 ? 'lg:grid-cols-2' : ''}`}
      >
        {sections.map((section) => (
          <HomeSectionPanel key={section.key} section={section} />
        ))}
      </div>
    </main>
  )
}
