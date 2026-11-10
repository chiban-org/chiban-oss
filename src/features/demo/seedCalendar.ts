import { AsyncLocalStorage } from 'node:async_hooks'
import { AppError, ErrorIds } from '@/constants/errorIds'
import { addDays, type CivilDate, daysBetween } from '@/types/civilDate'

export const DEMO_STORY_ANCHOR = '2026-11-05' as CivilDate

const DAYS_PER_WEEK = 7
const MS_PER_DAY = 86_400_000

const shiftDays = new AsyncLocalStorage<number>()

export function storyShiftFor(today: CivilDate): number {
  return Math.floor(daysBetween(DEMO_STORY_ANCHOR, today) / DAYS_PER_WEEK) * DAYS_PER_WEEK
}

export function withStoryCalendar<T>(today: CivilDate, run: () => Promise<T>): Promise<T> {
  return shiftDays.run(storyShiftFor(today), run)
}

export function storyShift(): number {
  const shift = shiftDays.getStore()
  if (shift === undefined) {
    throw new AppError(ErrorIds.DB_INVARIANT, 'Demo story date read outside the seed calendar')
  }
  return shift
}

export function storyDay(written: string): CivilDate {
  return addDays(written as CivilDate, storyShift())
}

export function storyInstant(written: string): Date {
  return new Date(Date.parse(written) + storyShift() * MS_PER_DAY)
}
