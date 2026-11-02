import type { HolidayCalendar } from '@/features/clocks/holidayCalendar'
import type { InspectionSettingsBody } from '@/features/inspections/settingsSchema'
import { addDays, type CivilDate, dayOfWeek } from '@/types/civilDate'

function isSchedulingWeekday(settings: InspectionSettingsBody, date: CivilDate): boolean {
  return (settings.schedulingDays as number[]).includes(dayOfWeek(date))
}

export function schedulingDates(
  settings: InspectionSettingsBody,
  holidays: HolidayCalendar,
  today: CivilDate,
): CivilDate[] {
  const dates: CivilDate[] = []
  for (let offset = settings.minNoticeDays; offset <= settings.horizonDays; offset += 1) {
    const date = addDays(today, offset)
    if (isSchedulingWeekday(settings, date) && !holidays.isHoliday(date)) dates.push(date)
  }
  return dates
}

export function slotStarts(settings: InspectionSettingsBody): number[] {
  const starts: number[] = []
  for (
    let minute = settings.windowStartMinute;
    minute + settings.slotMinutes <= settings.windowEndMinute;
    minute += settings.slotMinutes
  ) {
    starts.push(minute)
  }
  return starts
}

export function isPhoneRequestTime(
  settings: InspectionSettingsBody,
  holidays: HolidayCalendar,
  local: { date: CivilDate; minute: number },
): boolean {
  const hours = settings.phoneRequestHours
  return (
    (hours.days as number[]).includes(dayOfWeek(local.date)) &&
    !holidays.isHoliday(local.date) &&
    local.minute >= hours.startMinute &&
    local.minute < hours.endMinute
  )
}
