import { z } from 'zod'

const WeekdaySchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
])
const MinuteSchema = z.number().int().min(0).max(1440)

export const InspectionSettingsBodySchema = z
  .object({
    key: z.literal('default'),
    schedulingDays: z.array(WeekdaySchema).min(1),
    windowStartMinute: MinuteSchema,
    windowEndMinute: MinuteSchema,
    slotMinutes: z.number().int().min(15).max(240),
    minNoticeDays: z.number().int().min(0).max(30),
    horizonDays: z.number().int().min(1).max(180),
    maxPerInspectorPerDay: z.number().int().min(1).max(50),
    phoneRequestHours: z.object({
      days: z.array(WeekdaySchema),
      startMinute: MinuteSchema,
      endMinute: MinuteSchema,
    }),
    portalRequestsEnabled: z.boolean(),
  })
  .superRefine((value, ctx) => {
    if (value.windowStartMinute >= value.windowEndMinute) {
      ctx.addIssue({
        code: 'custom',
        path: ['windowEndMinute'],
        message: 'The window must end after it starts.',
      })
    } else if ((value.windowEndMinute - value.windowStartMinute) % value.slotMinutes !== 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['slotMinutes'],
        message: 'The window must divide evenly into slots of this length.',
      })
    }
    if (value.phoneRequestHours.startMinute >= value.phoneRequestHours.endMinute) {
      ctx.addIssue({
        code: 'custom',
        path: ['phoneRequestHours', 'endMinute'],
        message: 'Phone request hours must end after they start.',
      })
    }
  })

export type InspectionSettingsBody = z.infer<typeof InspectionSettingsBodySchema>
