import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clocks, regionalImpactDeterminations, regionalImpactParties } from '@/db/schema'
import { loadApplicationContext } from '@/features/applications/context'
import { recordCompletenessVote, setAcceptanceMeeting } from '@/features/boards/acceptance'
import { recordBoardRegionalImpact } from '@/features/boards/regionalImpact'
import { evaluateGates } from '@/features/gates/evaluateGates'
import {
  type BoardWorld,
  publishRegionalContacts,
  recordNoRegionalImpact,
  setupBoardWorld,
  submitBoardApplication,
} from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { staffActor } from '@/test/parcels'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
const NOW = new Date('2027-04-20T16:00:00Z')
let handle: TestDb
let world: BoardWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db)
  await publishRegionalContacts(handle.db, world)
})
afterEach(async () => {
  await handle.drop()
})

async function acceptedApplication() {
  const id = await submitBoardApplication(handle.db, world, world.pbTypeKey, '2027-03-24')
  await recordNoRegionalImpact(handle.db, world, id)
  const meetings = await handle.db.query.boardMeetings.findMany()
  const meetingId = meetings.find((m) => m.meetingDate === '2027-04-14')?.id ?? ''
  await setAcceptanceMeeting(handle.db, world.staff, { applicationId: id, meetingId }, signal)
  await recordCompletenessVote(
    handle.db,
    world.staff,
    { applicationId: id, meetingId, votedOn: d('2027-04-14'), outcome: 'accepted' },
    signal,
  )
  return id
}

describe('recordBoardRegionalImpact', () => {
  it('regional impact yes on 2027-04-20 supersedes the decision clock and moves 2027-06-18 to 2027-07-18', async () => {
    const id = await acceptedApplication()
    const result = await recordBoardRegionalImpact(
      handle.db,
      world.staff,
      { applicationId: id, determination: 'yes', municipalityKeys: ['pine_river', 'dunmore'] },
      signal,
      NOW,
    )
    expect(result).toEqual({ ok: true, value: undefined })
    const rows = await handle.db.select().from(clocks).where(eq(clocks.applicationId, id))
    const decisions = rows.filter((c) => c.ruleKey === 'nh.pb.decision')
    const old = decisions.find((c) => c.status === 'superseded')
    const fresh = decisions.find((c) => c.status === 'running')
    expect(old).toMatchObject({
      supersededReason: 'regional_impact_determined',
      currentDue: '2027-06-18',
    })
    expect(fresh).toMatchObject({ currentDue: '2027-07-18', startDate: '2027-04-14' })
    expect(old?.supersededBy).toBe(fresh?.id)
    const parties = await handle.db
      .select()
      .from(regionalImpactParties)
      .where(eq(regionalImpactParties.applicationId, id))
    expect(parties.map((p) => p.municipalityKey).sort()).toEqual(['dunmore', 'pine_river'])
  })

  it('regional impact yes without a municipality is municipality_required', async () => {
    const id = await acceptedApplication()
    expect(
      await recordBoardRegionalImpact(
        handle.db,
        world.staff,
        { applicationId: id, determination: 'yes', municipalityKeys: [] },
        signal,
        NOW,
      ),
    ).toEqual({ ok: false, error: 'municipality_required' })
  })

  it('an unlisted municipality is unknown_municipality', async () => {
    const id = await acceptedApplication()
    expect(
      await recordBoardRegionalImpact(
        handle.db,
        world.staff,
        { applicationId: id, determination: 'yes', municipalityKeys: ['atlantis'] },
        signal,
        NOW,
      ),
    ).toEqual({ ok: false, error: 'unknown_municipality' })
  })

  it('changing yes back to no restores the 65-day clock and clears the parties', async () => {
    const id = await acceptedApplication()
    await recordBoardRegionalImpact(
      handle.db,
      world.staff,
      { applicationId: id, determination: 'yes', municipalityKeys: ['dunmore'] },
      signal,
      NOW,
    )
    await recordBoardRegionalImpact(
      handle.db,
      world.staff,
      { applicationId: id, determination: 'no', municipalityKeys: [] },
      signal,
      NOW,
    )
    const rows = await handle.db.select().from(clocks).where(eq(clocks.applicationId, id))
    expect(
      rows.find((c) => c.ruleKey === 'nh.pb.decision' && c.status === 'running')?.currentDue,
    ).toBe('2027-06-18')
    expect(await handle.db.select().from(regionalImpactParties)).toHaveLength(0)
  })

  it('recording the same determination twice leaves one running clock', async () => {
    const id = await acceptedApplication()
    for (let i = 0; i < 2; i++) {
      await recordBoardRegionalImpact(
        handle.db,
        world.staff,
        { applicationId: id, determination: 'yes', municipalityKeys: ['dunmore'] },
        signal,
        NOW,
      )
    }
    const rows = await handle.db.select().from(clocks).where(eq(clocks.applicationId, id))
    expect(
      rows.filter((c) => c.ruleKey === 'nh.pb.decision' && c.status === 'running'),
    ).toHaveLength(1)
  })

  it('no determination blocks acceptance as unknown', async () => {
    const id = await submitBoardApplication(handle.db, world, world.pbTypeKey, '2027-03-24')
    const app = await loadApplicationContext(handle.db, id, signal)
    const results = await handle.db.transaction((tx) =>
      evaluateGates(tx, app as NonNullable<typeof app>, 'under_review', d('2027-04-14'), signal),
    )
    const gate = results.find((g) => g.key === 'nh.ri.determination')
    expect(gate?.outcome).toEqual({
      status: 'unknown',
      reason: 'Regional impact determination not recorded (RSA 36:57 I).',
    })
    expect(gate?.effective).toBe('blocked')
  })

  it('staff and inspector may determine; reviewer is forbidden', async () => {
    const id = await submitBoardApplication(handle.db, world, world.pbTypeKey, '2027-03-24')
    const inspector = await staffActor(handle.db, 'inspector')
    for (const actor of [world.staff, inspector]) {
      const r = await recordBoardRegionalImpact(
        handle.db,
        actor,
        { applicationId: id, determination: 'no', municipalityKeys: [] },
        signal,
        NOW,
      )
      expect(r.ok).toBe(true)
    }
    expect(
      await recordBoardRegionalImpact(
        handle.db,
        world.reviewer,
        { applicationId: id, determination: 'no', municipalityKeys: [] },
        signal,
        NOW,
      ),
    ).toEqual({ ok: false, error: 'forbidden' })
    const [row] = await handle.db
      .select()
      .from(regionalImpactDeterminations)
      .where(eq(regionalImpactDeterminations.applicationId, id))
    expect(row?.determination).toBe('no')
  })
})
