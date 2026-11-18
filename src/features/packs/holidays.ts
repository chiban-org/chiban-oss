import { type HolidayCalendar, makeHolidayCalendar } from '@/features/clocks/holidayCalendar'
import { activePack } from '@/features/packs/registry'
import type { CountingCitations, StatePack } from '@/features/packs/schema'

const calendars = new WeakMap<StatePack, HolidayCalendar>()

export function packHolidayCalendar(): HolidayCalendar {
  const pack = activePack()
  const cached = calendars.get(pack)
  if (cached !== undefined) return cached
  const built = makeHolidayCalendar((year) => pack.holidays(year))
  calendars.set(pack, built)
  return built
}

export function packCountingCitations(): CountingCitations {
  return activePack().countingCitations
}
