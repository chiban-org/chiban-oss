import type { Actor } from '@/features/auth/actor'
import { markComplete } from '@/features/building/completeness'
import { day, type MaineContext, noonOf } from '@/features/demo/me/maineContext'
import { FERNHOLLOW_STORIES } from '@/features/demo/me/maineStories'
import { actorFor, must, open, type Scenario } from '@/features/demo/seedPermitSupport'
import { assignReviewer, signOffReview } from '@/features/reviews/assignments'
import type { CivilDate } from '@/types/civilDate'

const BUILDING_VALUES = {
  classification: 'residential',
  dwelling_units: 1,
  floor_area_sq_ft: '640',
  estimated_cost: '48000.00',
  is_owner: 'yes',
  public_sewer: 'no',
}

export function openStory(
  ctx: MaineContext,
  input: {
    parcel: string
    title: string
    typeKey: string
    values: object
    on: CivilDate
  },
): Promise<Scenario> {
  return open(ctx.db, ctx.cast, ctx.signal, {
    parcel: input.parcel,
    title: input.title,
    typeKey: input.typeKey,
    values: { ...input.values },
    submittedOn: input.on,
  })
}

export async function markCompleteOn(
  ctx: MaineContext,
  s: Scenario,
  on: CivilDate,
  actor: Actor = ctx.cast.staff,
): Promise<void> {
  must(
    await markComplete(
      ctx.db,
      actor,
      { applicationId: s.applicationId, completedDate: on },
      ctx.signal,
      noonOf(on),
    ),
    'mark complete',
  )
}

export async function signedOffReview(ctx: MaineContext, s: Scenario): Promise<void> {
  const reviewer = await actorFor(ctx.db, 'reviewer', ctx.signal)
  const assigned = must(
    await assignReviewer(
      ctx.db,
      ctx.cast.staff,
      { applicationId: s.applicationId, reviewerUserId: reviewer.userId },
      ctx.signal,
    ),
    'review assignment',
  )
  must(
    await signOffReview(ctx.db, reviewer, { assignmentId: assigned.assignmentId }, ctx.signal),
    'review sign-off',
  )
}

export async function seedMaineBuildingPermits(ctx: MaineContext): Promise<void> {
  const inReview = await openStory(ctx, {
    parcel: 'R07-011',
    title: FERNHOLLOW_STORIES.buildingUnderReview,
    typeKey: 'BP',
    values: {
      ...BUILDING_VALUES,
      description: 'Bedroom and porch addition to a year-round camp',
      in_shoreland_zone: false,
    },
    on: day(ctx, -10),
  })
  await inReview.step('under_review', day(ctx, -8))

  const refused = await openStory(ctx, {
    parcel: 'R07-017',
    title: FERNHOLLOW_STORIES.buildingRefused,
    typeKey: 'BP',
    values: {
      ...BUILDING_VALUES,
      description: 'Detached two-bay garage',
      floor_area_sq_ft: '720',
      estimated_cost: '61000.00',
    },
    on: day(ctx, -45),
  })
  await refused.step('under_review', day(ctx, -43))
}

export async function seedMaineShoreland(ctx: MaineContext): Promise<void> {
  const s = await openStory(ctx, {
    parcel: 'R07-008',
    title: FERNHOLLOW_STORIES.shorelandIssued,
    typeKey: 'SLZ',
    values: {
      description: 'Deck on the lake side of an existing cottage',
      shoreland_district: 'limited_residential',
      activity: 'new_structure',
      distance_to_high_water_ft: 110,
    },
    on: day(ctx, -30),
  })
  await markCompleteOn(ctx, s, day(ctx, -28))
  await s.step('under_review', day(ctx, -27))
  await signedOffReview(ctx, s)
  await s.step('decided', day(ctx, -20))
  await s.step('issued', day(ctx, -18))
}
