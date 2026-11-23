import { and, asc, eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest'
import { AppError, ErrorIds } from '@/constants/errorIds'
import { appealNodes, applications, clocks } from '@/db/schema'
import { addAppealNode } from '@/features/appeals/graph'
import { type RecordDecisionInput, recordDecision } from '@/features/decisions/recordDecision'
import { setActivePackForTest } from '@/features/packs/registry'
import type { StatePack } from '@/features/packs/schema'
import {
  BOARD_FIXTURE_NOW,
  type BoardWorld,
  boardIdSql,
  boardTypeBody,
  setupBoardWorld,
  submitBoardApplication,
} from '@/test/boardFixtures'
import { saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { FIXTURE_VOTES } from '@/test/hearingFixtures'
import { XX_PB_SUBDIVISION_KEY } from '@/test/packs/xx/variants'
import type { CivilDate } from '@/types/civilDate'

export const signal = new AbortController().signal
export const d = (s: string) => s as CivilDate
export const ZBA_VOTE = '2027-04-15'
export const PB_VOTE = '2027-04-28'
export const SUB_TYPE_KEY = 'SUB'

export const finalityWorld = {} as { handle: TestDb; world: BoardWorld }

export async function meetingOn(date: string, board: 'planning_board' | 'zba'): Promise<string> {
  const rows = await finalityWorld.handle.db.query.boardMeetings.findMany({
    where: (m, { and: both, eq: same }) =>
      both(same(m.meetingDate, date), same(m.boardId, boardIdSql(board))),
  })
  return rows[0]?.id ?? ''
}

export async function underReview(typeKey: string): Promise<string> {
  const { handle, world } = finalityWorld
  const applicationId = await submitBoardApplication(handle.db, world, typeKey, '2027-03-02')
  await handle.db
    .update(applications)
    .set({ state: 'under_review' })
    .where(eq(applications.id, applicationId))
  return applicationId
}

export async function tryDecide(
  applicationId: string,
  board: 'planning_board' | 'zba',
  overrides: Partial<RecordDecisionInput> = {},
) {
  const { handle, world } = finalityWorld
  const votedOn = board === 'zba' ? ZBA_VOTE : PB_VOTE
  return await recordDecision(
    handle.db,
    world.staff,
    {
      applicationId,
      hearingId: null,
      meetingId: await meetingOn(votedOn, board),
      votedOn: d(votedOn),
      outcome: 'approved',
      motion: 'Move to approve as presented.',
      votes: FIXTURE_VOTES,
      findings: 'The proposal meets each criterion of the ordinance.',
      ...overrides,
    },
    signal,
    BOARD_FIXTURE_NOW,
  )
}

export async function decide(
  applicationId: string,
  board: 'planning_board' | 'zba',
  overrides: Partial<RecordDecisionInput> = {},
): Promise<string> {
  const recorded = await tryDecide(applicationId, board, overrides)
  if (!recorded.ok)
    throw new AppError(ErrorIds.DB_INVARIANT, `decision: ${JSON.stringify(recorded.error)}`)
  return recorded.value.decisionId
}

export async function decisionNodeOf(applicationId: string): Promise<string> {
  const [node] = await finalityWorld.handle.db
    .select({ id: appealNodes.id })
    .from(appealNodes)
    .where(eq(appealNodes.applicationId, applicationId))
    .orderBy(asc(appealNodes.createdAt))
  return node?.id ?? ''
}

export async function addStep(
  parentId: string,
  kind: Parameters<typeof addAppealNode>[2]['kind'],
  occurredOn: string,
  extra: Partial<Parameters<typeof addAppealNode>[2]> = {},
) {
  return await addAppealNode(
    finalityWorld.handle.db,
    finalityWorld.world.staff,
    { parentId, kind, occurredOn: d(occurredOn), ...extra },
    signal,
    BOARD_FIXTURE_NOW,
  )
}

export async function petition(parentId: string, occurredOn: string) {
  return await addStep(parentId, 'court_petition', occurredOn)
}

export async function petitionUntimely(parentId: string, occurredOn: string): Promise<boolean> {
  const added = await petition(parentId, occurredOn)
  if (!added.ok) throw new AppError(ErrorIds.DB_INVARIANT, `petition: ${added.error}`)
  const [row] = await finalityWorld.handle.db
    .select({ untimely: appealNodes.untimely })
    .from(appealNodes)
    .where(eq(appealNodes.id, added.value.nodeId))
  return row?.untimely ?? false
}

export async function clocksOf(applicationId: string, ruleKey: string) {
  return await finalityWorld.handle.db
    .select()
    .from(clocks)
    .where(and(eq(clocks.applicationId, applicationId), eq(clocks.ruleKey, ruleKey)))
}

export function underPack(pack: StatePack) {
  beforeAll(() => {
    setActivePackForTest(pack)
  })
  afterAll(() => {
    setActivePackForTest(null)
  })
  beforeEach(async () => {
    const handle = await makeTestDb()
    const world = await setupBoardWorld(handle.db, {
      zbaMeetings: [ZBA_VOTE],
      pack,
      classificationKey: 'xx.board_variance',
    })
    await saveAndPublish(
      handle.db,
      world.admin,
      'application_type',
      SUB_TYPE_KEY,
      boardTypeBody(XX_PB_SUBDIVISION_KEY, SUB_TYPE_KEY, SUB_TYPE_KEY, {}, pack),
    )
    finalityWorld.handle = handle
    finalityWorld.world = world
  })
}

export function dropAfterEach() {
  afterEach(async () => {
    await finalityWorld.handle.drop()
  })
}
