import { and, eq } from 'drizzle-orm'
import { inspections } from '@/db/schema'
import type { CoverageContext } from '@/features/demo/seedCoverage'
import { nextInspectionDay } from '@/features/demo/seedInspections'
import { payByCard, payByCheck } from '@/features/demo/seedPayments'
import { actorFor, findApplication, must, noon, open } from '@/features/demo/seedPermitSupport'
import { checklistItems } from '@/features/inspections/checklistItems'
import { getInspectionSettings } from '@/features/inspections/inspectionSettings'
import { requestInspection } from '@/features/inspections/requestInspection'
import { scheduleInspection } from '@/features/inspections/schedule'
import { slotStarts } from '@/features/inspections/slots'
import { weekStart } from '@/features/payments/entryList'
import { addDays, type CivilDate } from '@/types/civilDate'

type Tender = 'cash' | 'check' | 'card'

interface CounterPermit {
  title: string
  typeKey: 'PL' | 'MG'
  license: string
  parcel: string
  tender: Tender
  earlierThisWeek: boolean
}

const COUNTER_PERMITS: readonly CounterPermit[] = [
  {
    title: 'Water heater paid in cash',
    typeKey: 'PL',
    license: 'PL-30211',
    parcel: '007019000000',
    tender: 'cash',
    earlierThisWeek: false,
  },
  {
    title: 'Furnace paid by check',
    typeKey: 'MG',
    license: 'MG-11802',
    parcel: '007021000000',
    tender: 'check',
    earlierThisWeek: false,
  },
  {
    title: 'Range hookup paid by card',
    typeKey: 'MG',
    license: 'MG-11802',
    parcel: '007022000000',
    tender: 'card',
    earlierThisWeek: false,
  },
  {
    title: 'Laundry sink paid in cash',
    typeKey: 'PL',
    license: 'PL-30211',
    parcel: '007023000000',
    tender: 'cash',
    earlierThisWeek: true,
  },
]

const STOPS_PER_DAY = 2
const BOOKING_LEAD_DAYS = 3
const ROUGH_IN_PERMITS = [
  'Payments: Gas line paid in cash',
  'Payments: Bathroom paid by simulated card',
]

async function issueAtCounter(ctx: CoverageContext, permit: CounterPermit, title: string) {
  const day = permit.earlierThisWeek ? weekStart(ctx.today) : ctx.today
  const s = await open(ctx.db, ctx.cast, ctx.signal, {
    parcel: permit.parcel,
    title,
    typeKey: permit.typeKey,
    values: { description: 'Counter permit', contractor_license_number: permit.license },
    submittedOn: day,
  })
  const input = { applicationId: s.applicationId, payerName: 'Demo counter customer' }
  if (permit.tender === 'check') {
    await payByCheck(
      ctx.db,
      ctx.cast.staff,
      { ...input, checkNumber: '2214' },
      ctx.signal,
      noon(day),
    )
  }
  if (permit.tender === 'card') {
    await payByCard(ctx.db, ctx.cast.staff, input, ctx.signal, noon(day))
  }
  await s.step('issued', day)
}

async function paymentsToday(ctx: CoverageContext): Promise<boolean> {
  let added = false
  for (const permit of COUNTER_PERMITS) {
    const title = `Counter ${ctx.today}: ${permit.title}`
    if ((await findApplication(ctx.db, title)) !== null) continue
    await issueAtCounter(ctx, permit, title)
    added = true
  }
  return added
}

async function bookRoughIn(
  ctx: CoverageContext,
  booking: { applicationId: string; inspectorUserId: string },
  day: CivilDate,
  startMinute: number,
): Promise<void> {
  const { applicationId, inspectorUserId } = booking
  const bookedAt = noon(addDays(day, -BOOKING_LEAD_DAYS))
  const checklist = await checklistItems(ctx.db, applicationId, 'rough', ctx.signal)
  const made = must(
    await requestInspection(
      ctx.db,
      ctx.cast.staff,
      {
        applicationId,
        checklistVersionId: checklist.checklistVersionId,
        channel: 'phone',
        contactName: 'Pat Contractor',
        contactPhone: '603-555-0142',
        accessNotes: 'Side door is unlocked. Mechanical room in the basement.',
      },
      ctx.signal,
      { now: bookedAt },
    ),
    'rough-in request',
  )
  must(
    await scheduleInspection(
      ctx.db,
      ctx.cast.staff,
      {
        inspectionId: made.inspectionId,
        inspectorUserId,
        date: day,
        startMinute,
        expectedRowVersion: 1,
      },
      ctx.signal,
      { now: bookedAt },
    ),
    'rough-in booking',
  )
}

async function inspectionsToday(ctx: CoverageContext): Promise<boolean> {
  const inspector = await actorFor(ctx.db, 'inspector', ctx.signal)
  const day = await nextInspectionDay(ctx.db, ctx.today, ctx.signal)
  const booked = await ctx.db
    .select({ startMinute: inspections.startMinute })
    .from(inspections)
    .where(
      and(
        eq(inspections.inspectorUserId, inspector.userId),
        eq(inspections.scheduledDate, day),
        eq(inspections.status, 'scheduled'),
      ),
    )
  if (booked.length >= STOPS_PER_DAY) return false
  const taken = new Set(booked.map((b) => b.startMinute))
  const free = slotStarts(await getInspectionSettings(ctx.db, ctx.signal)).filter(
    (minute) => !taken.has(minute),
  )
  let added = 0
  for (const title of ROUGH_IN_PERMITS.slice(0, STOPS_PER_DAY - booked.length)) {
    const applicationId = await findApplication(ctx.db, title)
    const startMinute = free.at(added)
    if (applicationId === null || startMinute === undefined) continue
    await bookRoughIn(ctx, { applicationId, inspectorUserId: inspector.userId }, day, startMinute)
    added += 1
  }
  return added > 0
}

export async function seedTodayWork(ctx: CoverageContext): Promise<boolean> {
  const steps = [await paymentsToday(ctx), await inspectionsToday(ctx)]
  return steps.some(Boolean)
}
