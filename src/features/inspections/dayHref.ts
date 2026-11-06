export const INSPECTOR_DAY_PATH = '/staff/inspections/day'

export function inspectorDayHref(date: string, inspectorUserId: string): string {
  return `${INSPECTOR_DAY_PATH}?date=${date}&inspector=${inspectorUserId}`
}
