import { INSPECTOR_DAY_PATH, inspectorDayHref } from '@/features/inspections/dayHref'
import {
  countRequestedInspections,
  countStopsOn,
  listMissingResults,
  stopsByInspectorOn,
  upcomingInspectionDays,
} from '@/features/inspections/inspectorWork'
import { managesAllInspectors } from '@/features/inspections/visibility'
import type { HomeContext, HomeRow, HomeSection } from '@/features/staffHome/homeTypes'
import { mayOpen } from '@/features/staffNav/navItems'

const DAY = INSPECTOR_DAY_PATH
const SCHEDULE = '/staff/inspections'
const NEXT_DAYS = 3

async function requests(ctx: HomeContext): Promise<HomeRow[]> {
  if (!mayOpen(SCHEDULE, ctx.viewer)) return []
  const count = await countRequestedInspections(ctx.db, ctx.actor, ctx.signal)
  return [{ label: 'Requests to schedule', count, href: SCHEDULE }]
}

async function loadOwnDay(ctx: HomeContext): Promise<HomeSection> {
  const day = { inspectorUserId: ctx.actor.userId, date: ctx.today }
  const [missing, stops, requested, days] = await Promise.all([
    listMissingResults(ctx.db, ctx.actor, { ...day, today: ctx.today, limit: 1 }, ctx.signal),
    countStopsOn(ctx.db, ctx.actor, day, ctx.signal),
    requests(ctx),
    upcomingInspectionDays(ctx.db, ctx.actor, { ...day, limit: NEXT_DAYS }, ctx.signal),
  ])
  const missingCount = missing.ok ? missing.value.total : 0
  return {
    key: 'inspections',
    title: 'Inspections',
    urgency: missingCount,
    rows: [
      { label: 'Still need a result', count: missingCount, href: `${DAY}#missing-results` },
      { label: "Stops on today's route", count: stops, href: DAY },
      ...requested,
    ],
    links: [{ label: 'Open My day', href: DAY }],
    detail: {
      kind: 'days',
      days: days.map((d) => ({ ...d, href: inspectorDayHref(d.date, ctx.actor.userId) })),
    },
  }
}

async function loadTownDay(ctx: HomeContext): Promise<HomeSection> {
  const [stops, requested] = await Promise.all([
    stopsByInspectorOn(ctx.db, ctx.actor, ctx.today, ctx.signal),
    requests(ctx),
  ])
  return {
    key: 'inspections',
    title: 'Inspections',
    urgency: 0,
    rows: [
      ...stops.map((s) => ({
        label: `Stops today for ${s.name}`,
        count: s.count,
        href: inspectorDayHref(ctx.today, s.inspectorUserId),
      })),
      ...requested,
    ],
    links: [{ label: 'Open the schedule board', href: SCHEDULE }],
    detail: null,
  }
}

export async function loadInspectorSection(ctx: HomeContext): Promise<HomeSection | null> {
  if (ctx.actor.roles.includes('inspector')) {
    return mayOpen(DAY, ctx.viewer) ? await loadOwnDay(ctx) : null
  }
  if (!managesAllInspectors(ctx.actor) || !mayOpen(SCHEDULE, ctx.viewer)) return null
  return await loadTownDay(ctx)
}
