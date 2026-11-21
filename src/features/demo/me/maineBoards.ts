import { eq } from 'drizzle-orm'
import { applications, decisionDeliveries } from '@/db/schema'
import { recordCompletenessVote, setAcceptanceMeeting } from '@/features/boards/acceptance'
import { setApplicationMunicipalities } from '@/features/boards/applicationMunicipalities'
import { recordSourceWaterDetermination } from '@/features/boards/sourceWater'
import { recordDecisionDelivery } from '@/features/decisions/delivery'
import { recordDecision } from '@/features/decisions/recordDecision'
import { recordFinalWrittenApproval } from '@/features/decisions/recording'
import { boardVotes } from '@/features/demo/me/maineBoardSetup'
import { day, type MaineContext, meetingOn, noonOf } from '@/features/demo/me/maineContext'
import {
  holdNoticedHearing,
  issueAbutterList,
  proveNoticeSet,
  scheduleBoardHearing,
} from '@/features/demo/me/maineNotices'
import { openStory } from '@/features/demo/me/mainePermits'
import { FERNHOLLOW_STORIES } from '@/features/demo/me/maineStories'
import { must } from '@/features/demo/seedPermitSupport'
import { prepareReceiptNotices } from '@/features/notices/receiptNotices'
import { addParty } from '@/features/projects/parties'
import type { CivilDate } from '@/types/civilDate'

const COMMON = {
  applicant_name: 'Alex Applicant',
  applicant_mailing_address: '20 Loon Cove Road, Fernhollow, ME 04000',
  owner_authorization: true,
}

async function acceptAt(ctx: MaineContext, applicationId: string, on: ReturnType<typeof day>) {
  const meetingId = await meetingOn(ctx.db, 'planning_board', on)
  must(
    await setAcceptanceMeeting(ctx.db, ctx.cast.staff, { applicationId, meetingId }, ctx.signal),
    'acceptance meeting',
  )
  must(
    await recordCompletenessVote(
      ctx.db,
      ctx.cast.staff,
      { applicationId, meetingId, votedOn: on, outcome: 'accepted' },
      ctx.signal,
      noonOf(on),
    ),
    'completeness vote',
  )
}

export async function seedMaineSubdivision(ctx: MaineContext): Promise<void> {
  const received = day(ctx, -49)
  const s = await openStory(ctx, {
    parcel: 'R07-015',
    title: FERNHOLLOW_STORIES.subdivision,
    typeKey: 'SUB',
    values: {
      ...COMMON,
      project_description: 'Four house lots off Kettle Hill Road',
      lot_count: 4,
      dwelling_unit_count: 4,
      total_acreage: '18.5',
    },
    on: received,
  })
  const applicationId = s.applicationId
  must(
    await recordSourceWaterDetermination(
      ctx.db,
      ctx.cast.staff,
      { applicationId, determination: 'not_within', supplierKey: null },
      ctx.signal,
      noonOf(received),
    ),
    'source water',
  )
  must(
    await setApplicationMunicipalities(
      ctx.db,
      ctx.cast.staff,
      { applicationId, municipalities: [{ key: 'brackett', relation: 'abutting' }] },
      ctx.signal,
    ),
    'municipalities',
  )
  await issueAbutterList(ctx, applicationId, day(ctx, -48))
  const receipt = must(
    await prepareReceiptNotices(ctx.db, ctx.cast.staff, { applicationId }, ctx.signal),
    'receipt notices',
  )
  await proveNoticeSet(ctx, applicationId, receipt.noticeSetId, day(ctx, -45))
  await acceptAt(ctx, applicationId, day(ctx, -35))
  const decidedOn = day(ctx, -14)
  must(
    await recordDecision(
      ctx.db,
      ctx.cast.staff,
      {
        applicationId,
        hearingId: null,
        meetingId: await meetingOn(ctx.db, 'planning_board', decidedOn),
        votedOn: decidedOn,
        outcome: 'approved',
        motion: 'Move to approve the Kettle Hill subdivision as presented.',
        votes: boardVotes('planning_board'),
        findings: 'The subdivision meets each review criterion of the ordinance.',
        significant: false,
      },
      ctx.signal,
      noonOf(decidedOn),
    ),
    'subdivision decision',
  )
}

const VARIANCE_VALUES = {
  ...COMMON,
  project_description: 'Garage closer to the side line than the ordinance allows',
  ordinance_section: 'Land Use Ordinance, Section 7.2',
  relief_requested: 'Reduce the side setback from 20 feet to 11 feet',
  variance_type: 'undue_hardship',
  criterion_reasonable_return: 'The narrow lot cannot hold a garage without relief.',
  criterion_unique_circumstances: 'A ledge outcrop fills the buildable rear of the lot.',
  criterion_essential_character: 'Garages close to the side line are common on the lane.',
  criterion_not_self_created: 'The lot lines date from a 1950s division.',
}

async function addAgent(ctx: MaineContext, applicationId: string): Promise<void> {
  const [app] = await ctx.db
    .select({ projectId: applications.projectId })
    .from(applications)
    .where(eq(applications.id, applicationId))
  must(
    await addParty(
      ctx.db,
      ctx.cast.staff,
      {
        projectId: app?.projectId ?? '',
        role: 'agent',
        name: 'Ivy Larkin, Larkin Survey and Design',
        ownerAuthorizationOnFile: true,
      },
      ctx.signal,
    ),
    'agent party',
  )
}

async function deliverDecision(ctx: MaineContext, applicationId: string, on: CivilDate) {
  const rows = await ctx.db
    .select({ id: decisionDeliveries.id })
    .from(decisionDeliveries)
    .where(eq(decisionDeliveries.applicationId, applicationId))
  for (const row of rows) {
    must(
      await recordDecisionDelivery(
        ctx.db,
        ctx.cast.staff,
        { deliveryId: row.id, method: 'mail', deliveredOn: on },
        ctx.signal,
        noonOf(on),
      ),
      'decision delivery',
    )
  }
}

export async function seedMaineVariance(ctx: MaineContext): Promise<void> {
  const s = await openStory(ctx, {
    parcel: 'R07-009',
    title: FERNHOLLOW_STORIES.variance,
    typeKey: 'VAR',
    values: VARIANCE_VALUES,
    on: day(ctx, -50),
  })
  await addAgent(ctx, s.applicationId)
  await issueAbutterList(ctx, s.applicationId, day(ctx, -48))
  const heldOn = day(ctx, -21)
  const hearing = await scheduleBoardHearing(ctx, s.applicationId, { board: 'zba', on: heldOn })
  await holdNoticedHearing(
    ctx,
    { ...hearing, applicationId: s.applicationId },
    { provedOn: day(ctx, -33), heldOn },
  )
  const decided = must(
    await recordDecision(
      ctx.db,
      ctx.cast.staff,
      {
        applicationId: s.applicationId,
        hearingId: hearing.hearingId,
        votedOn: heldOn,
        outcome: 'approved',
        motion: 'Move to grant the setback variance as presented.',
        votes: boardVotes('zba'),
        findings: 'Strict application of the ordinance would cause undue hardship.',
      },
      ctx.signal,
      noonOf(heldOn),
    ),
    'variance decision',
  )
  await deliverDecision(ctx, s.applicationId, day(ctx, -19))
  const approvedOn = day(ctx, -14)
  must(
    await recordFinalWrittenApproval(
      ctx.db,
      ctx.cast.staff,
      { decisionId: decided.decisionId, approvedOn },
      ctx.signal,
      noonOf(approvedOn),
    ),
    'final written approval',
  )
}

export async function seedMaineAdminAppeal(ctx: MaineContext): Promise<void> {
  const s = await openStory(ctx, {
    parcel: 'R07-017',
    title: FERNHOLLOW_STORIES.adminAppeal,
    typeKey: 'AA',
    values: {
      ...COMMON,
      project_description: 'Appeal of the refused garage building permit',
      decision_appealed: 'Building permit for a detached garage, refused by operation of law',
      decision_by: 'Code Enforcement Officer',
      decision_date: day(ctx, -14),
      grounds: 'No written decision was issued within 30 days and the garage meets the ordinance.',
    },
    on: day(ctx, -7),
  })
  await issueAbutterList(ctx, s.applicationId, day(ctx, -6))
  await scheduleBoardHearing(ctx, s.applicationId, { board: 'zba', on: day(ctx, 14) })
}
