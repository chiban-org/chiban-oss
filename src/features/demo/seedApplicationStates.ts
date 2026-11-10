import { createApplication } from '@/features/applications/createApplication'
import { recordBoardRegionalImpact } from '@/features/boards/regionalImpact'
import { VARIANCE_VALUES } from '@/features/demo/seedBoardApps'
import { storyDay } from '@/features/demo/seedCalendar'
import type { CoverageContext } from '@/features/demo/seedCoverage'
import {
  actorFor,
  BUILDING_VALUES,
  completeAndReview,
  findApplication,
  must,
  open,
  readyToIssue,
  TITLE_PREFIX,
} from '@/features/demo/seedPermitSupport'
import { resolveParcelId } from '@/features/parcels/resolveParcelId'
import { createProject } from '@/features/projects/projects'
import { assignReviewer } from '@/features/reviews/assignments'
import { addDays } from '@/types/civilDate'

const BP_DECISION_DAYS = 30
const ZBA_HEARING_DAYS = 45
const DAYS_LEFT = 3
const ISSUED_LEAD_DAYS = 10

type Step = (ctx: CoverageContext, title: string) => Promise<void>

async function draft(ctx: CoverageContext, title: string): Promise<void> {
  const parcel = must(
    await resolveParcelId(ctx.db, { value: '007015000000' }, ctx.signal),
    'draft parcel',
  )
  const project = must(
    await createProject(
      ctx.db,
      ctx.cast.applicant,
      { parcelId: parcel.parcelId, title: `${TITLE_PREFIX} ${title}` },
      ctx.signal,
    ),
    'draft project',
  )
  must(
    await createApplication(
      ctx.db,
      ctx.cast.applicant,
      { projectId: project.projectId, applicationTypeKey: 'BP' },
      ctx.signal,
      ctx.now,
    ),
    'draft application',
  )
}

async function withdrawn(ctx: CoverageContext, title: string): Promise<void> {
  const s = await open(ctx.db, ctx.cast, ctx.signal, {
    parcel: '007016000000',
    title,
    typeKey: 'BP',
    values: BUILDING_VALUES,
    submittedOn: storyDay('2026-09-14'),
  })
  await completeAndReview(s, storyDay('2026-09-15'), storyDay('2026-09-16'))
  const reviewer = await actorFor(ctx.db, 'reviewer', ctx.signal)
  must(
    await assignReviewer(
      ctx.db,
      ctx.cast.staff,
      { applicationId: s.applicationId, reviewerUserId: reviewer.userId },
      ctx.signal,
    ),
    'review of the withdrawn permit',
  )
  await s.step('withdrawn', storyDay('2026-09-30'))
}

async function readyAtCounter(ctx: CoverageContext, title: string): Promise<void> {
  const s = await open(ctx.db, ctx.cast, ctx.signal, {
    parcel: '007017000000',
    title,
    typeKey: 'BP',
    values: { ...BUILDING_VALUES, description: 'Ten by twelve storage shed on skids' },
    submittedOn: storyDay('2026-10-05'),
  })
  await completeAndReview(s, storyDay('2026-10-06'), storyDay('2026-10-07'))
  await readyToIssue(s, storyDay('2026-10-28'))
}

async function issuedAwaitingCensus(ctx: CoverageContext, title: string): Promise<void> {
  const s = await open(ctx.db, ctx.cast, ctx.signal, {
    parcel: '007012000000',
    title,
    typeKey: 'BP',
    values: { ...BUILDING_VALUES, description: 'Single-car detached garage with a loft' },
    submittedOn: addDays(ctx.today, -ISSUED_LEAD_DAYS),
  })
  await completeAndReview(
    s,
    addDays(ctx.today, -ISSUED_LEAD_DAYS + 1),
    addDays(ctx.today, -ISSUED_LEAD_DAYS + 2),
  )
  await readyToIssue(s, addDays(ctx.today, -1))
  await s.step('issued', ctx.today)
}

async function buildingDueSoon(ctx: CoverageContext, title: string): Promise<void> {
  const completed = addDays(ctx.today, DAYS_LEFT - BP_DECISION_DAYS)
  const s = await open(ctx.db, ctx.cast, ctx.signal, {
    parcel: '007018000000',
    title,
    typeKey: 'BP',
    values: { ...BUILDING_VALUES, description: 'Mudroom addition at the side entry' },
    submittedOn: addDays(completed, -1),
  })
  await completeAndReview(s, completed, completed)
}

async function varianceDueSoon(ctx: CoverageContext, title: string): Promise<void> {
  const s = await open(ctx.db, ctx.cast, ctx.signal, {
    parcel: '009013000000',
    title,
    typeKey: 'VAR',
    values: VARIANCE_VALUES,
    submittedOn: addDays(ctx.today, DAYS_LEFT - ZBA_HEARING_DAYS),
  })
  must(
    await recordBoardRegionalImpact(
      ctx.db,
      ctx.cast.staff,
      { applicationId: s.applicationId, determination: 'no', municipalityKeys: [] },
      ctx.signal,
      ctx.now,
    ),
    'regional impact for the variance due soon',
  )
}

const STATES: readonly [string, Step][] = [
  ['Fence along the north line', draft],
  ['Porch withdrawn by the owner', withdrawn],
  ['Shed ready to issue', readyAtCounter],
  ['Garage issued, awaiting Census count', issuedAwaitingCensus],
  ['Mudroom addition due this week', buildingDueSoon],
  ['Pintail Way setback variance', varianceDueSoon],
]

export async function seedApplicationStates(ctx: CoverageContext): Promise<boolean> {
  let added = false
  for (const [title, step] of STATES) {
    if ((await findApplication(ctx.db, title)) !== null) continue
    await step(ctx, title)
    added = true
  }
  return added
}
