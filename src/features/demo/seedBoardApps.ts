import { eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { applications } from '@/db/schema'
import { issueList } from '@/features/abutters/issue'
import { generateList } from '@/features/abutters/lists'
import { transitionApplication } from '@/features/applications/transition'
import { recordCompletenessVote, setAcceptanceMeeting } from '@/features/boards/acceptance'
import { recordSelectmenCertification } from '@/features/boards/certification'
import { recordDesDetermination } from '@/features/boards/des500'
import { linkReliance, recordFinalApproval } from '@/features/boards/exercise'
import { recordBoardRegionalImpact } from '@/features/boards/regionalImpact'
import { type Cast, d, must, noon, open, type Scenario } from '@/features/demo/seedPermitSupport'
import { addProfessional } from '@/features/rosters/professionals'
import type { CivilDate } from '@/types/civilDate'

export const COMMON = {
  project_description: 'Demonstration board application',
  applicant_name: 'Alex Applicant',
  applicant_mailing_address: '12 Osprey Lane, Alder Pond NH 03999',
  owner_authorization: true,
}

async function meetingId(db: Db, board: 'planning_board' | 'zba', date: string): Promise<string> {
  const rows = await db.query.boardMeetings.findMany({
    where: (m, { and, eq: equals }) => and(equals(m.board, board), equals(m.meetingDate, date)),
  })
  return rows[0]?.id ?? ''
}

async function setMeeting(
  db: Db,
  cast: Cast,
  s: Scenario,
  board: 'planning_board' | 'zba',
  date: string,
) {
  must(
    await setAcceptanceMeeting(
      db,
      cast.staff,
      { applicationId: s.applicationId, meetingId: await meetingId(db, board, date) },
      s.signal,
    ),
    `acceptance meeting ${date}`,
  )
}

async function issueFor(db: Db, cast: Cast, s: Scenario, now: Date): Promise<void> {
  const made = must(
    await generateList(db, cast.staff, { applicationId: s.applicationId }, s.signal, now),
    'generate list',
  )
  must(await issueList(db, cast.staff, { listId: made.listId }, s.signal, now), 'issue list')
}

export async function seedSitePlan(db: Db, cast: Cast, signal: AbortSignal, now: Date) {
  const s = await open(db, cast, signal, {
    parcel: '009001000000',
    title: 'Osprey Point site plan',
    typeKey: 'SPR',
    values: { ...COMMON, gross_floor_area_sq_ft: 12000, parking_spaces: 40 },
    submittedOn: '2026-10-20',
  })
  must(
    await addProfessional(
      db,
      cast.staff,
      {
        applicationId: s.applicationId,
        name: 'Rae Fenn',
        profession: 'land_surveyor',
        businessAddress: '8 Survey Row, Alder Pond NH 03999',
        sealOnPlat: true,
      },
      signal,
    ),
    'professional',
  )
  must(
    await recordBoardRegionalImpact(
      db,
      cast.staff,
      { applicationId: s.applicationId, determination: 'no', municipalityKeys: [] },
      signal,
      now,
    ),
    'regional impact',
  )
  must(
    await recordDesDetermination(
      db,
      cast.staff,
      { applicationId: s.applicationId, determination: 'not_within', reason: '' },
      signal,
      now,
    ),
    'des determination',
  )
  await issueFor(db, cast, s, now)
  await setMeeting(db, cast, s, 'planning_board', '2026-11-25')
  return s
}

export async function seedMinorSitePlan(db: Db, cast: Cast, signal: AbortSignal, now: Date) {
  const s = await open(db, cast, signal, {
    parcel: '009016000000',
    title: 'Brookview minor site plan',
    typeKey: 'MSP',
    values: { ...COMMON, gross_floor_area_sq_ft: 4200 },
    submittedOn: '2026-07-01',
  })
  must(
    await recordBoardRegionalImpact(
      db,
      cast.staff,
      {
        applicationId: s.applicationId,
        determination: 'yes',
        municipalityKeys: ['pine_river', 'dunmore'],
      },
      signal,
      now,
    ),
    'regional impact',
  )
  must(
    await recordDesDetermination(
      db,
      cast.staff,
      { applicationId: s.applicationId, determination: 'within_500ft', reason: '' },
      signal,
      now,
    ),
    'des determination',
  )
  await issueFor(db, cast, s, now)
  await setMeeting(db, cast, s, 'planning_board', '2026-07-22')
  must(
    await recordCompletenessVote(
      db,
      cast.staff,
      {
        applicationId: s.applicationId,
        meetingId: await meetingId(db, 'planning_board', '2026-07-22'),
        votedOn: d('2026-07-22'),
        outcome: 'accepted',
      },
      signal,
    ),
    'completeness vote',
  )
  must(
    await recordSelectmenCertification(
      db,
      cast.staff,
      { applicationId: s.applicationId, requestedOn: d('2026-10-28'), outcome: 'pending' },
      signal,
    ),
    'certification request',
  )
  return s
}

export const VARIANCE_VALUES = {
  ...COMMON,
  ordinance_section: 'Article 4, Section 4.3',
  relief_requested: 'Reduce the side setback from 20 feet to 12 feet',
  criterion_public_interest: 'The addition keeps the character of the neighborhood.',
  criterion_spirit_of_ordinance: 'Light and air to neighbors are unchanged.',
  criterion_substantial_justice: 'The benefit to the owner outweighs any harm to the public.',
  criterion_surrounding_values: 'No loss of value is expected for surrounding properties.',
  criterion_hardship: 'The narrow lot cannot hold the addition without relief.',
}

export async function seedPendingVariance(db: Db, cast: Cast, signal: AbortSignal, now: Date) {
  const s = await open(db, cast, signal, {
    parcel: '009012000000',
    title: 'Brookside setback variance',
    typeKey: 'VAR',
    values: VARIANCE_VALUES,
    submittedOn: '2026-10-22',
  })
  must(
    await recordBoardRegionalImpact(
      db,
      cast.staff,
      { applicationId: s.applicationId, determination: 'no', municipalityKeys: [] },
      signal,
      now,
    ),
    'regional impact',
  )
  await setMeeting(db, cast, s, 'zba', '2026-11-17')
  must(
    await generateList(db, cast.staff, { applicationId: s.applicationId }, signal, now),
    'draft list',
  )
  return s
}

export async function seedGrantedVariance(
  db: Db,
  cast: Cast,
  signal: AbortSignal,
  now: Date,
  planning: Scenario,
) {
  const s = await open(db, cast, signal, {
    parcel: '009017000000',
    title: 'Bittern Meadow frontage variance',
    typeKey: 'VAR',
    values: VARIANCE_VALUES,
    submittedOn: '2026-03-02',
  })
  must(
    await recordBoardRegionalImpact(
      db,
      cast.staff,
      { applicationId: s.applicationId, determination: 'no', municipalityKeys: [] },
      signal,
      now,
    ),
    'regional impact',
  )
  await issueFor(db, cast, s, now)
  await setMeeting(db, cast, s, 'zba', '2026-04-15')
  must(
    await recordCompletenessVote(
      db,
      cast.staff,
      {
        applicationId: s.applicationId,
        meetingId: await meetingId(db, 'zba', '2026-04-15'),
        votedOn: d('2026-04-15'),
        outcome: 'accepted',
      },
      signal,
    ),
    'hearing opened',
  )
  const [row] = await db.select().from(applications).where(eq(applications.id, s.applicationId))
  must(
    await db.transaction((tx) =>
      transitionApplication(
        tx,
        cast.staff,
        {
          applicationId: s.applicationId,
          to: 'decided',
          expectedRowVersion: row?.rowVersion ?? 0,
          onDate: d('2026-05-13'),
        },
        signal,
        noon('2026-05-13'),
      ),
    ),
    'variance granted',
  )
  must(
    await db.transaction((tx) =>
      recordFinalApproval(
        tx,
        cast.staff,
        { applicationId: s.applicationId, finalOn: d('2026-05-13') },
        signal,
      ),
    ),
    'final approval',
  )
  must(
    await linkReliance(
      db,
      cast.staff,
      { varianceApplicationId: s.applicationId, planningApplicationId: planning.applicationId },
      signal,
    ),
    'reliance link',
  )
  return s
}
