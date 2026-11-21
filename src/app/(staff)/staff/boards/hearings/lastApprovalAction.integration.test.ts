import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { applications } from '@/db/schema'
import { recordDecision } from '@/features/decisions/recordDecision'
import { setActivePackForTest } from '@/features/packs/registry'
import { refuseField } from '@/server/formInput'
import {
  BOARD_FIXTURE_NOW,
  type BoardWorld,
  boardIdSql,
  boardTypeBody,
  setupBoardWorld,
  submitBoardApplication,
} from '@/test/boardFixtures'
import { saveAndPublish } from '@/test/configFixtures'
import { FIXTURE_VOTES } from '@/test/hearingFixtures'
import { XX_PROJECT_FINALITY } from '@/test/packs/xx/projectFinality'
import { XX_PB_SUBDIVISION_KEY } from '@/test/packs/xx/variants'
import { actionHarness } from '@/test/testHarness/actions'
import type { CivilDate } from '@/types/civilDate'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))
vi.mock('@/features/mail/transport', () => import('@/test/testHarness/actions/mocks/mailTransport'))

const { recordDecisionWithoutHearingAction } = await import('./decisionActions')

const h = actionHarness()
const signal = new AbortController().signal
let world: BoardWorld

async function meetingOn(date: string, board: 'planning_board' | 'zba'): Promise<string> {
  const rows = await h.db.query.boardMeetings.findMany({
    where: (m, { and, eq: same }) =>
      and(same(m.meetingDate, date), same(m.boardId, boardIdSql(board))),
  })
  return rows[0]?.id ?? ''
}

async function underReview(typeKey: string): Promise<string> {
  const applicationId = await submitBoardApplication(h.db, world, typeKey, '2027-03-02')
  await h.db
    .update(applications)
    .set({ state: 'under_review' })
    .where(eq(applications.id, applicationId))
  return applicationId
}

beforeAll(async () => {
  setActivePackForTest(XX_PROJECT_FINALITY)
  world = await setupBoardWorld(h.db, {
    zbaMeetings: ['2027-04-15'],
    pack: XX_PROJECT_FINALITY,
    classificationKey: 'xx.board_variance',
  })
  await saveAndPublish(
    h.db,
    world.admin,
    'application_type',
    'SUB',
    boardTypeBody(XX_PB_SUBDIVISION_KEY, 'SUB', 'SUB', {}, XX_PROJECT_FINALITY),
  )
  vi.useFakeTimers({ toFake: ['Date'], now: BOARD_FIXTURE_NOW })
})
afterAll(() => {
  vi.useRealTimers()
  setActivePackForTest(null)
})

describe('declaring the last approval on a project that is already final', () => {
  it('refuses beside the last approval checkbox', async () => {
    const plan = await underReview('SUB')
    const variance = await underReview(world.zbaTypeKey)
    const first = await recordDecision(
      h.db,
      world.staff,
      {
        applicationId: plan,
        hearingId: null,
        meetingId: await meetingOn('2027-04-28', 'planning_board'),
        votedOn: '2027-04-28' as CivilDate,
        outcome: 'approved',
        motion: 'Move to approve as presented.',
        votes: FIXTURE_VOTES,
        findings: 'The proposal meets each criterion of the ordinance.',
        finalMunicipalApproval: true,
      },
      signal,
      BOARD_FIXTURE_NOW,
    )
    expect(first.ok).toBe(true)
    h.signIn(await h.actorFor('admin'))
    const form = h.form({
      applicationId: variance,
      meetingId: await meetingOn('2027-04-15', 'zba'),
      votedOn: '2027-04-15',
      outcome: 'approved',
      motion: 'Move to approve as presented.',
      votes: 'Avery Stone: for\nRobin Vale: for\nMorgan Reed: for',
      findings: 'The proposal meets each criterion of the ordinance.',
      finalMunicipalApproval: 'on',
    })
    expect(await recordDecisionWithoutHearingAction(form)).toEqual(
      refuseField(
        'finalMunicipalApproval',
        'The project already has its last municipal approval, recorded on another decision.',
      ),
    )
  })
})
