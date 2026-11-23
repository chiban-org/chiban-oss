import { eq } from 'drizzle-orm'
import { inspections } from '@/db/schema'
import {
  day,
  inspectionDayOnOrBefore,
  type MaineContext,
  noonOf,
} from '@/features/demo/me/maineContext'
import { markCompleteOn, openStory, signedOffReview } from '@/features/demo/me/mainePermits'
import { FERNHOLLOW_STORIES } from '@/features/demo/me/maineStories'
import { must, type Scenario } from '@/features/demo/seedPermitSupport'
import { checklistItems } from '@/features/inspections/checklistItems'
import { recordInspectionResult } from '@/features/inspections/recordResult'
import { requestInspection } from '@/features/inspections/requestInspection'
import { scheduleInspection } from '@/features/inspections/schedule'
import { addDays, type CivilDate } from '@/types/civilDate'

const FIRST_SLOT = 570
const PLUMBER_LICENSE = 'MP-4471'

async function rowVersion(ctx: MaineContext, inspectionId: string): Promise<number> {
  const [row] = await ctx.db.select().from(inspections).where(eq(inspections.id, inspectionId))
  return row?.rowVersion ?? 1
}

async function passInspection(
  ctx: MaineContext,
  s: Scenario,
  input: { type: string; on: CivilDate },
): Promise<void> {
  const info = await checklistItems(ctx.db, s.applicationId, input.type, ctx.signal)
  const bookedAt = noonOf(addDays(input.on, -3))
  const made = must(
    await requestInspection(
      ctx.db,
      ctx.plumber,
      {
        applicationId: s.applicationId,
        checklistVersionId: info.checklistVersionId,
        channel: 'phone',
        contactName: 'Cory Contractor',
        contactPhone: '207-555-0163',
        accessNotes: 'Field is behind the barn.',
      },
      ctx.signal,
      { now: bookedAt },
    ),
    `request ${input.type}`,
  )
  must(
    await scheduleInspection(
      ctx.db,
      ctx.plumber,
      {
        inspectionId: made.inspectionId,
        inspectorUserId: ctx.plumber.userId,
        date: input.on,
        startMinute: FIRST_SLOT,
        expectedRowVersion: await rowVersion(ctx, made.inspectionId),
      },
      ctx.signal,
      { now: bookedAt },
    ),
    `schedule ${input.type}`,
  )
  must(
    await recordInspectionResult(
      ctx.db,
      ctx.plumber,
      {
        inspectionId: made.inspectionId,
        result: 'passed',
        items: info.items.map((item) => ({
          itemKey: item.key,
          outcome: 'pass' as const,
        })),
        expectedRowVersion: await rowVersion(ctx, made.inspectionId),
      },
      ctx.signal,
      { now: new Date(`${input.on}T19:00:00Z`) },
    ),
    `result ${input.type}`,
  )
}

export async function seedMainePlumbing(ctx: MaineContext): Promise<void> {
  const internal = await openStory(ctx, {
    parcel: 'R07-002',
    title: FERNHOLLOW_STORIES.plumbingIssued,
    typeKey: 'IP',
    values: {
      description: 'Kitchen sink, dishwasher and laundry tub',
      contractor_license_number: PLUMBER_LICENSE,
      fixture_count: 3,
    },
    on: day(ctx, -6),
  })
  await internal.step('issued', day(ctx, -5), ctx.plumber)

  const wastewater = await openStory(ctx, {
    parcel: 'R07-013',
    title: FERNHOLLOW_STORIES.wastewater,
    typeKey: 'SSW',
    values: {
      description: 'Replacement septic tank and disposal field',
      contractor_license_number: PLUMBER_LICENSE,
      non_engineered_systems: 1,
    },
    on: day(ctx, -40),
  })
  await markCompleteOn(ctx, wastewater, day(ctx, -38), ctx.plumber)
  await wastewater.step('under_review', day(ctx, -37))
  await signedOffReview(ctx, wastewater)
  await wastewater.step('decided', day(ctx, -31), ctx.plumber)
  await wastewater.step('issued', day(ctx, -30), ctx.plumber)
  await passInspection(ctx, wastewater, {
    type: 'site_preparation',
    on: inspectionDayOnOrBefore(day(ctx, -20)),
  })
  await passInspection(ctx, wastewater, {
    type: 'before_covering',
    on: inspectionDayOnOrBefore(day(ctx, -11)),
  })
}
