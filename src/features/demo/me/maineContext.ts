import { and, eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { boardMeetings } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { boardIdOf } from '@/features/boards/townBoards'
import { pickInspectionDays } from '@/features/demo/inspectionDays'
import { actorFor, type Cast } from '@/features/demo/seedPermitSupport'
import { packHolidayCalendar } from '@/features/packs/holidays'
import { activePack } from '@/features/packs/registry'
import type { ObjectStore } from '@/features/storage/objectStore'
import { addDays, type CivilDate, dayOfWeek } from '@/types/civilDate'

export interface MaineContext {
  db: Db
  signal: AbortSignal
  store: ObjectStore
  now: Date
  today: CivilDate
  cast: Cast
  plumber: Actor
}

export function day(ctx: MaineContext, offset: number): CivilDate {
  return addDays(ctx.today, offset)
}

const MEETING_WEEKDAY = { planning_board: 3, zba: 2 } as const
const DAYS_PER_WEEK = 7

export const MEETING_WEEKS = { planning_board: [-8, -5, -2, 1, 4], zba: [-6, -3, 2, 5] } as const

export function meetingDay(ctx: MaineContext, board: 'planning_board' | 'zba', weeks: number) {
  const weekday = board === 'planning_board' ? MEETING_WEEKDAY.planning_board : MEETING_WEEKDAY.zba
  const back = (dayOfWeek(ctx.today) - weekday + DAYS_PER_WEEK) % DAYS_PER_WEEK
  return addDays(ctx.today, weeks * DAYS_PER_WEEK - back)
}

export function noonOf(date: CivilDate): Date {
  return new Date(`${date}T16:00:00Z`)
}

export function inspectionDayOnOrBefore(date: CivilDate): CivilDate {
  const days = activePack().inspectionSettingsDefault.schedulingDays as number[]
  const holidays = packHolidayCalendar()
  const isDay = (d: CivilDate) => days.includes(dayOfWeek(d)) && !holidays.isHoliday(d)
  return pickInspectionDays(isDay, date).seeded
}

export async function meetingOn(
  db: Db,
  board: 'planning_board' | 'zba',
  date: CivilDate,
): Promise<string> {
  const [row] = await db
    .select({ id: boardMeetings.id })
    .from(boardMeetings)
    .where(
      and(
        eq(boardMeetings.boardId, await boardIdOf(db, board)),
        eq(boardMeetings.meetingDate, date),
      ),
    )
  return row?.id ?? ''
}

export async function maineContext(
  db: Db,
  input: {
    signal: AbortSignal
    store: ObjectStore
    now: Date
    today: CivilDate
  },
): Promise<MaineContext> {
  const { signal } = input
  return {
    db,
    ...input,
    cast: {
      admin: await actorFor(db, 'admin', signal),
      staff: await actorFor(db, 'staff', signal),
      applicant: await actorFor(db, 'applicant', signal),
    },
    plumber: await actorFor(db, 'plumbing', signal),
  }
}
