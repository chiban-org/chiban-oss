import { z } from 'zod'
import type { CalendarAccountInput } from '@/features/calendar/calendarAccounts'
import type { ScheduleInput } from '@/features/inspections/schedule'
import type { RequestInspectionInput } from '@/features/inspections/types'
import { parseCivilDate } from '@/types/civilDate'

const CivilField = z.string().transform((value, ctx) => {
  const parsed = parseCivilDate(value)
  if (!parsed.ok) {
    ctx.addIssue({ code: 'custom', message: 'invalid date' })
    return z.NEVER
  }
  return parsed.value
})

function Optional<T extends z.ZodType>(schema: T) {
  return z.preprocess(
    (value) =>
      typeof value === 'string' ? (value.trim() === '' ? undefined : value.trim()) : value,
    schema.optional(),
  )
}

const RequestSchema = z.object({
  applicationId: z.uuid(),
  checklistVersionId: z.uuid(),
  channel: z.enum(['phone', 'counter', 'portal']),
  preferredDate: Optional(CivilField),
  contactName: z.string().trim().min(1).max(200),
  contactPhone: Optional(z.string().max(60)),
  accessNotes: Optional(z.string().max(1000)),
  reinspectionOf: Optional(z.uuid()),
})

const ScheduleSchema = z.object({
  inspectionId: z.uuid(),
  inspectorUserId: z.uuid(),
  date: CivilField,
  startMinute: z.coerce.number().int().min(0).max(1439),
  expectedRowVersion: z.coerce.number().int().min(1),
  offGridReason: Optional(z.string().max(500)),
})

const CancelSchema = z.object({
  inspectionId: z.uuid(),
  expectedRowVersion: z.coerce.number().int().min(1),
})

const CertificateSchema = z.object({
  applicationId: z.uuid(),
  issuedOn: CivilField,
  expectedRowVersion: z.coerce.number().int().min(1),
})

const CalendarSchema = z.object({
  userId: z.uuid(),
  kind: z.enum(['ics_email', 'graph']),
  email: z.email(),
  graphUserId: Optional(z.string().max(320)),
})

const AccountSchema = z.object({
  tenantId: z.string().trim().min(1).max(200),
  clientId: z.string().trim().min(1).max(200),
  clientSecret: z.string().min(1).max(500),
})

function entries(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of formData.entries()) if (typeof value === 'string') out[key] = value
  return out
}

export function parseRequestForm(
  formData: FormData,
  channels: readonly string[],
): RequestInspectionInput | null {
  const { preferredDate: rawDate, ...others } = entries(formData)
  const raw = rawDate === 'any' ? others : { ...others, preferredDate: rawDate }
  const parsed = RequestSchema.safeParse(raw)
  if (!parsed.success || !channels.includes(parsed.data.channel)) return null
  const { preferredDate, contactPhone, accessNotes, reinspectionOf, ...rest } = parsed.data
  return {
    ...rest,
    ...(preferredDate === undefined ? {} : { preferredDate }),
    ...(contactPhone === undefined ? {} : { contactPhone }),
    ...(accessNotes === undefined ? {} : { accessNotes }),
    ...(reinspectionOf === undefined ? {} : { reinspectionOf }),
  }
}

export function parseScheduleForm(formData: FormData): ScheduleInput | null {
  const parsed = ScheduleSchema.safeParse(entries(formData))
  if (!parsed.success) return null
  const { offGridReason, date, ...rest } = parsed.data
  return {
    ...rest,
    date,
    ...(offGridReason === undefined ? {} : { offGrid: { reason: offGridReason } }),
  }
}

export function parseCancelForm(formData: FormData) {
  const parsed = CancelSchema.safeParse(entries(formData))
  return parsed.success ? parsed.data : null
}

export function parseCertificateForm(formData: FormData) {
  const parsed = CertificateSchema.safeParse(entries(formData))
  return parsed.success ? parsed.data : null
}

export function parseCalendarForm(formData: FormData) {
  const parsed = CalendarSchema.safeParse(entries(formData))
  if (!parsed.success) return null
  const { graphUserId, ...rest } = parsed.data
  return { ...rest, ...(graphUserId === undefined ? {} : { graphUserId }) }
}

export function parseAccountForm(formData: FormData): CalendarAccountInput | null {
  const parsed = AccountSchema.safeParse(entries(formData))
  return parsed.success ? parsed.data : null
}
