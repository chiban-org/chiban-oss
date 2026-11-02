import type { InspectionSettingsBody } from '@/features/inspections/settingsSchema'

export const NH_INSPECTION_SETTINGS_DEFAULT: InspectionSettingsBody = {
  key: 'default',
  schedulingDays: [1, 3, 5],
  windowStartMinute: 570,
  windowEndMinute: 930,
  slotMinutes: 60,
  minNoticeDays: 1,
  horizonDays: 30,
  maxPerInspectorPerDay: 6,
  phoneRequestHours: { days: [1, 2, 3, 4, 5], startMinute: 480, endMinute: 720 },
  portalRequestsEnabled: true,
}
