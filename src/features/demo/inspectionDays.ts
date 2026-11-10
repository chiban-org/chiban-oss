import { addDays, type CivilDate } from '@/types/civilDate'

const LOOKBACK_DAYS = 30

export interface InspectionDays {
  seeded: CivilDate
  recent: CivilDate
  earlier: CivilDate
  ahead: CivilDate
}

function firstInspectionDay(
  isDay: (date: CivilDate) => boolean,
  from: CivilDate,
  step: 1 | -1,
): CivilDate {
  let day = from
  for (let moved = 0; moved < LOOKBACK_DAYS && !isDay(day); moved += 1) day = addDays(day, step)
  return day
}

export function pickInspectionDays(
  isDay: (date: CivilDate) => boolean,
  today: CivilDate,
): InspectionDays {
  const seeded = firstInspectionDay(isDay, today, -1)
  const recent = firstInspectionDay(isDay, addDays(seeded, -1), -1)
  const earlier = firstInspectionDay(isDay, addDays(recent, -1), -1)
  const ahead = firstInspectionDay(isDay, addDays(today, 1), 1)
  return { seeded, recent, earlier, ahead }
}
