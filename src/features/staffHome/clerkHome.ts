import { countWorkQueue, listWorkQueue, type WorkQueueFilters } from '@/features/queue/workQueue'
import type { HomeContext, HomeLink, HomeSection } from '@/features/staffHome/homeTypes'
import { mayOpen } from '@/features/staffNav/navItems'

const DUE_SOON = 6
const APPLICATIONS = '/staff/applications'

const WAITING: readonly { label: string; href: string; filters: WorkQueueFilters }[] = [
  { label: 'Past a deadline', href: `${APPLICATIONS}?due=overdue`, filters: { due: ['overdue'] } },
  {
    label: 'Submitted, not yet under review',
    href: `${APPLICATIONS}?state=submitted`,
    filters: { stateKeys: ['submitted'] },
  },
  {
    label: 'Reviews back, ready to decide',
    href: `${APPLICATIONS}?flag=reviewed`,
    filters: { flags: ['reviewed'] },
  },
  {
    label: 'Assigned to you',
    href: `${APPLICATIONS}?assigned=me`,
    filters: { assigned: ['me'] },
  },
]

export async function loadClerkSection(ctx: HomeContext): Promise<HomeSection | null> {
  if (!mayOpen(APPLICATIONS, ctx.viewer)) return null
  const [counts, soon] = await Promise.all([
    countWorkQueue(
      ctx.db,
      ctx.actor,
      WAITING.map((w) => w.filters),
      ctx.today,
      ctx.signal,
    ),
    listWorkQueue(ctx.db, ctx.actor, { filters: {}, limit: DUE_SOON }, ctx.signal),
  ])
  const links: HomeLink[] = [{ label: 'Open applications', href: APPLICATIONS }]
  if (mayOpen('/staff/counter', ctx.viewer)) {
    links.push({ label: 'Start at the counter', href: '/staff/counter' })
  }
  return {
    key: 'applications',
    title: 'Applications',
    urgency: counts[0] ?? 0,
    rows: WAITING.map((w, i) => ({ label: w.label, href: w.href, count: counts.at(i) ?? 0 })),
    links,
    detail: { kind: 'deadlines', rows: soon.rows.filter((row) => row.nextDue !== null) },
  }
}
