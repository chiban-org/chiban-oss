import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applicationConditions, applications, boardDecisions, clocks } from '@/db/schema'
import {
  generateDecisionDocuments,
  renderDecisionPdfs,
} from '@/features/decisions/decisionDocuments'
import { type RecordDecisionInput, recordDecision } from '@/features/decisions/recordDecision'
import type { ObjectStore } from '@/features/storage/objectStore'
import {
  BOARD_FIXTURE_NOW,
  type BoardWorld,
  endFixtureTerm,
  setupBoardWorld,
} from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  type HeldHearing,
  heldPbHearing,
  heldZbaHearing,
  publishBoardTemplates,
} from '@/test/hearingFixtures'
import { findIsoDates, findRawKeys, findUuids } from '@/test/leaks'
import { makeTestStore } from '@/test/minio'
import { pdfText } from '@/test/pdfText'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
let handle: TestDb
let world: BoardWorld
let store: ObjectStore

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db, { zbaMeetings: ['2027-04-15'] })
  store = (await makeTestStore()).store
})
afterEach(async () => {
  await handle.drop()
})

const VOTES = {
  for: 4,
  against: 1,
  abstain: 0,
  members: [
    { name: 'Avery Stone', vote: 'for' as const },
    { name: 'Robin Vale', vote: 'for' as const },
    { name: 'Morgan Reed', vote: 'for' as const },
    { name: 'Casey Lund', vote: 'for' as const },
    { name: 'Drew Hale', vote: 'against' as const },
  ],
}

function input(
  held: HeldHearing,
  overrides: Partial<RecordDecisionInput> = {},
): RecordDecisionInput {
  return {
    applicationId: held.applicationId,
    hearingId: held.hearingId,
    votedOn: d('2027-04-15'),
    outcome: 'approved',
    motion: 'Move to approve as presented.',
    votes: VOTES,
    findings: 'The proposal meets each criterion of the ordinance.',
    ...overrides,
  }
}

async function record(held: HeldHearing, overrides: Partial<RecordDecisionInput> = {}) {
  return await recordDecision(
    handle.db,
    world.staff,
    input(held, overrides),
    signal,
    BOARD_FIXTURE_NOW,
  )
}

async function clockRows(applicationId: string) {
  return await handle.db.select().from(clocks).where(eq(clocks.applicationId, applicationId))
}

describe('recordDecision required fields', () => {
  it('denial without reasons is missingFields reasonsForDisapproval', async () => {
    const held = await heldZbaHearing(handle.db, world)
    expect(await record(held, { outcome: 'denied' })).toEqual({
      ok: false,
      error: { missingFields: ['reasonsForDisapproval'] },
    })
  })

  it('conditional approval without conditions is missingFields conditions', async () => {
    const held = await heldZbaHearing(handle.db, world)
    expect(await record(held, { outcome: 'approved_with_conditions' })).toEqual({
      ok: false,
      error: { missingFields: ['conditions'] },
    })
  })

  it('decision without findings is missingFields findings', async () => {
    const held = await heldZbaHearing(handle.db, world)
    expect(await record(held, { findings: '   ' })).toEqual({
      ok: false,
      error: { missingFields: ['findings'] },
    })
  })

  it('member votes summing to 4 against totals of 5 is votes_inconsistent', async () => {
    const held = await heldZbaHearing(handle.db, world)
    const votes = { ...VOTES, members: VOTES.members.slice(0, 4) }
    expect(await record(held, { votes })).toEqual({ ok: false, error: 'votes_inconsistent' })
    expect(await handle.db.select().from(boardDecisions)).toEqual([])
  })

  it('a recused member is not counted in the totals', async () => {
    const held = await heldZbaHearing(handle.db, world)
    const votes = {
      ...VOTES,
      members: [...VOTES.members, { name: 'Sam Pike', vote: 'recused' as const }],
    }
    expect((await record(held, { votes })).ok).toBe(true)
  })

  it('a decision before the hearing is held is refused', async () => {
    const held = await heldZbaHearing(handle.db, world)
    await handle.db.execute(
      `update hearings set status = 'scheduled' where id = '${held.hearingId}'`,
    )
    expect(await record(held)).toEqual({ ok: false, error: 'hearing_not_held' })
  })

  it('a hearing of another application is not_found', async () => {
    const held = await heldZbaHearing(handle.db, world)
    const other = await heldZbaHearing(handle.db, world)
    expect(await record(held, { hearingId: other.hearingId })).toEqual({
      ok: false,
      error: 'not_found',
    })
  })

  it('a reviewer recording a decision is forbidden', async () => {
    const held = await heldZbaHearing(handle.db, world)
    expect(
      await recordDecision(handle.db, world.reviewer, input(held), signal, BOARD_FIXTURE_NOW),
    ).toEqual({
      ok: false,
      error: 'forbidden',
    })
  })

  it('a second decision for the same hearing is refused', async () => {
    const held = await heldZbaHearing(handle.db, world)
    expect((await record(held)).ok).toBe(true)
    expect((await record(held)).ok).toBe(false)
  })
})

describe('recordDecision effects', () => {
  it('approval on 2027-06-09 meets the decision clock and starts the filing clock due 2027-06-16', async () => {
    const held = await heldPbHearing(handle.db, world)
    expect((await record(held, { votedOn: d('2027-06-09') })).ok).toBe(true)
    const rows = await clockRows(held.applicationId)
    expect(rows.find((c) => c.ruleKey === 'nh.pb.decision')).toMatchObject({
      status: 'met',
      metOn: '2027-06-09',
    })
    expect(rows.find((c) => c.ruleKey === 'nh.board.decision_filing')).toMatchObject({
      status: 'running',
      currentDue: '2027-06-16',
    })
    expect(
      (
        await handle.db.select().from(applications).where(eq(applications.id, held.applicationId))
      )[0]?.state,
    ).toBe('decided')
  })

  it('planning board approval starts a court window and no rehearing window', async () => {
    const held = await heldPbHearing(handle.db, world)
    await record(held, { votedOn: d('2027-06-09') })
    const rows = await clockRows(held.applicationId)
    expect(rows.find((c) => c.ruleKey === 'nh.appeal.pb_court')?.currentDue).toBe('2027-07-09')
    expect(rows.find((c) => c.ruleKey === 'nh.appeal.zba_rehearing')).toBeUndefined()
  })

  it('zba approval starts a rehearing window due 2027-05-17', async () => {
    const held = await heldZbaHearing(handle.db, world)
    expect((await record(held)).ok).toBe(true)
    const rows = await clockRows(held.applicationId)
    expect(rows.find((c) => c.ruleKey === 'nh.zba.decision')).toMatchObject({
      status: 'met',
      metOn: '2027-04-15',
    })
    expect(rows.find((c) => c.ruleKey === 'nh.appeal.zba_rehearing')?.currentDue).toBe('2027-05-17')
    expect(rows.find((c) => c.ruleKey === 'nh.ri.transmittal')).toBeUndefined()
  })

  it('regional impact adds the transmittal clock due 2027-04-22', async () => {
    const held = await heldZbaHearing(handle.db, world, { regional: 'yes' })
    await record(held)
    const rows = await clockRows(held.applicationId)
    expect(rows.find((c) => c.ruleKey === 'nh.ri.transmittal')?.currentDue).toBe('2027-04-22')
  })

  it('a denial moves the application to denied', async () => {
    const held = await heldZbaHearing(handle.db, world)
    const denied = await record(held, {
      outcome: 'denied',
      reasonsForDisapproval: 'The hardship test is not met.',
    })
    expect(denied.ok).toBe(true)
    expect(
      (
        await handle.db.select().from(applications).where(eq(applications.id, held.applicationId))
      )[0]?.state,
    ).toBe('denied')
  })

  it('precedent condition blocks issuance and a plain condition does not', async () => {
    const held = await heldZbaHearing(handle.db, world)
    const result = await record(held, {
      outcome: 'approved_with_conditions',
      conditions: [
        { code: 'SURVEY', text: 'File a stamped boundary survey.', precedent: true },
        { code: 'SHIELD', text: 'Shield all exterior lights.', precedent: false },
      ],
    })
    expect(result.ok).toBe(true)
    const rows = await handle.db
      .select()
      .from(applicationConditions)
      .where(eq(applicationConditions.applicationId, held.applicationId))
    expect(Object.fromEntries(rows.map((r) => [r.code, [r.blocksIssuance, r.status]]))).toEqual({
      SURVEY: [true, 'unmet'],
      SHIELD: [false, 'unmet'],
    })
  })
})

describe('decision documents', () => {
  async function decided() {
    await publishBoardTemplates(handle.db, world)
    const held = await heldZbaHearing(handle.db, world)
    const result = await record(held, {
      outcome: 'approved_with_conditions',
      conditions: [{ code: 'SURVEY', text: 'File a stamped boundary survey.', precedent: true }],
    })
    if (!result.ok) throw new Error(JSON.stringify(result.error))
    return { held, decisionId: result.value.decisionId }
  }

  it('notice of decision contains the findings and the RSA 677:2 appeal rights', async () => {
    const { decisionId } = await decided()
    const pdfs = await renderDecisionPdfs(handle.db, decisionId, signal)
    if (!pdfs.ok) throw new Error(pdfs.error)
    for (const pdf of pdfs.value) {
      const text = (await pdfText(pdf.bytes)).replace(/\s+/g, ' ')
      expect(text).toContain('The proposal meets each criterion of the ordinance.')
      expect(text).toContain('RSA 677:2')
      expect(text).toContain('File a stamped boundary survey.')
      expect(text).toContain('Approved with conditions')
      expect(text).not.toContain('approved_with_conditions')
      expect(findIsoDates(text)).toEqual([])
      expect(findUuids(text)).toEqual([])
      expect(
        findRawKeys(text, ['approved_with_conditions', 'nh.zba_variance', 'zba_decision']),
      ).toEqual([])
    }
  })

  it('generating documents attaches both to the application as private project documents', async () => {
    const { held, decisionId } = await decided()
    const made = await generateDecisionDocuments(handle.db, store, world.staff, decisionId, signal)
    if (!made.ok) throw new Error(made.error)
    const docs = await handle.db.query.documents.findMany({
      where: (doc, { eq: equals }) => equals(doc.recordId, held.applicationId),
    })
    const mine = docs.filter((x) =>
      [made.value.noticeOfDecisionId, made.value.letterId].includes(x.id),
    )
    expect(mine).toHaveLength(2)
    expect(mine.every((x) => x.isPublic === false && x.audiences.includes('project_parties'))).toBe(
      true,
    )
    const [row] = await handle.db
      .select()
      .from(boardDecisions)
      .where(eq(boardDecisions.id, decisionId))
    expect(row?.writtenDecisionDocumentId).toBe(made.value.noticeOfDecisionId)
  })

  it('generating twice is already_generated', async () => {
    const { decisionId } = await decided()
    await generateDecisionDocuments(handle.db, store, world.staff, decisionId, signal)
    expect(
      await generateDecisionDocuments(handle.db, store, world.staff, decisionId, signal),
    ).toEqual({
      ok: false,
      error: 'already_generated',
    })
  })

  it('a reviewer generating documents is forbidden', async () => {
    const { decisionId } = await decided()
    expect(
      await generateDecisionDocuments(handle.db, store, world.reviewer, decisionId, signal),
    ).toEqual({
      ok: false,
      error: 'forbidden',
    })
  })
})

describe('recordDecision voters', () => {
  it('a vote by someone not seated on the board is notSeated, naming them', async () => {
    const held = await heldZbaHearing(handle.db, world)
    const votes = {
      for: 2,
      against: 0,
      abstain: 0,
      members: [
        { name: 'drew  hale', vote: 'for' as const },
        { name: 'Nobody Real', vote: 'for' as const },
      ],
    }
    expect(await record(held, { votes })).toEqual({
      ok: false,
      error: { notSeated: ['Nobody Real'] },
    })
    const rows = await handle.db
      .select()
      .from(boardDecisions)
      .where(eq(boardDecisions.hearingId, held.hearingId))
    expect(rows).toEqual([])
  })

  it('a member whose term ended before the vote is not seated', async () => {
    const held = await heldZbaHearing(handle.db, world)
    await endFixtureTerm(handle.db, 'Casey Lund', 'zba', '2027-04-14')
    expect(await record(held)).toEqual({ ok: false, error: { notSeated: ['Casey Lund'] } })
  })
})
