import { addDays, type CivilDate } from '@/types/civilDate'

const LOOKBACK_DAYS = 30

export interface InspectionDays {
  seeded: CivilDate
  recent: CivilDate
  earlier: CivilDate
}

function dayOnOrBefore(isDay: (date: CivilDate) => boolean, from: CivilDate): CivilDate {
  let day = from
  for (let back = 0; back < LOOKBACK_DAYS && !isDay(day); back += 1) day = addDays(day, -1)
  return day
}

export function pickInspectionDays(
  isDay: (date: CivilDate) => boolean,
  today: CivilDate,
): InspectionDays {
  const seeded = dayOnOrBefore(isDay, today)
  const recent = dayOnOrBefore(isDay, addDays(seeded, -1))
  const earlier = dayOnOrBefore(isDay, addDays(recent, -1))
  return { seeded, recent, earlier }
}
