import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cureNotices, enforcementCases } from '@/db/schema'
import { loadCaseDetail } from '@/features/enforcement/caseDetail'
import { EVERY_CASE_ABILITY } from '@/features/enforcement/caseNextStep'
import { openCase, setCaseStatus } from '@/features/enforcement/cases'
import {
  applyCureProcedure,
  cureStatus,
  recordCureReturnReceipt,
  sendCureNotice,
} from '@/features/enforcement/cureNotices'
import { markFindingCorrected } from '@/features/enforcement/findingChanges'
import { recordFinding } from '@/features/enforcement/findings'
import { planCaseWork } from '@/features/enforcement/workPlan'
import { setActivePackForTest } from '@/features/packs/registry'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  type EnforcementWorld,
  FIXTURE_NOW,
  setupEnforcementWorld,
} from '@/test/enforcementFixtures'
import { XX_CURE, XX_CURE_RULE_KEY } from '@/test/packs/xx/cure'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
const NOW = new Date('2027-03-02T15:00:00Z')
const SENT = d('2027-03-01')
const DUE = d('2027-03-11')
const OWNER = { name: 'Larkspur Family Trust', mailingAddress: '9 Fern Road, Vellmora' }
const OCCUPANT = { name: 'Robin Renter', mailingAddress: '14 Birch Lane, Vellmora' }
let handle: TestDb
let world: EnforcementWorld

beforeAll(() => {
  setActivePackForTest(XX_CURE)
})
afterAll(() => {
  setActivePackForTest(null)
})
beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupEnforcementWorld(handle.db)
})
afterEach(async () => {
  await handle.drop()
})

async function foundCase(count = 1): Promise<{ caseId: string; findingIds: string[] }> {
  const opened = await openCase(handle.db, world.staff, { locationText: '14 Birch Lane' }, signal)
  if (!opened.ok) throw new Error(opened.error)
  const { caseId } = opened.value
  await setCaseStatus(
    handle.db,
    world.staff,
    { caseId, to: 'investigating', expectedRowVersion: 1 },
    signal,
  )
  const findingIds: string[] = []
  for (let i = 0; i < count; i += 1) {
    const made = await addFinding(caseId, i)
    findingIds.push(made)
  }
  return { caseId, findingIds }
}

async function addFinding(caseId: string, n: number): Promise<string> {
  const made = await recordFinding(
    handle.db,
    world.staff,
    {
      caseId,
      provisionKind: 'zoning_ordinance',
      provisionRef: `Zoning Ordinance Section 4.${String(n + 1)}`,
      facts: 'Trees were cut inside the shoreland strip.',
      inspectionDate: '2027-02-20',
    },
    signal,
    FIXTURE_NOW,
  )
  if (!made.ok) throw new Error(made.error)
  return made.value.findingId
}

async function chooseCure(caseId: string) {
  const applied = await applyCureProcedure(
    handle.db,
    world.staff,
    { caseId, ruleKey: XX_CURE_RULE_KEY },
    signal,
  )
  if (!applied.ok) throw new Error(applied.error)
}

function send(caseId: string, findingIds: string[], occupant: typeof OCCUPANT | 'none' = 'none') {
  return sendCureNotice(
    handle.db,
    world.staff,
    { caseId, findingIds, owner: OWNER, occupant, sentOn: SENT, documentId: null },
    signal,
    NOW,
  )
}

async function planOn(caseId: string, today: CivilDate) {
  const detail = await loadCaseDetail(handle.db, world.staff, caseId, today, signal)
  if (!detail.ok) throw new Error(detail.error)
  return planCaseWork(detail.value, { abilities: EVERY_CASE_ABILITY, responsible: null })
}

describe('choosing the cure procedure for a case', () => {
  it('records the rule on the case and lets it be cleared before any notice', async () => {
    const { caseId } = await foundCase()
    await chooseCure(caseId)
    const [row] = await handle.db
      .select()
      .from(enforcementCases)
      .where(eq(enforcementCases.id, caseId))
    expect(row?.cureRuleKey).toBe(XX_CURE_RULE_KEY)
    const cleared = await applyCureProcedure(
      handle.db,
      world.staff,
      { caseId, ruleKey: null },
      signal,
    )
    expect(cleared).toEqual({ ok: true, value: undefined })
  })

  it('refuses a rule key the pack does not carry as a cure procedure', async () => {
    const { caseId } = await foundCase()
    const result = await applyCureProcedure(
      handle.db,
      world.staff,
      { caseId, ruleKey: 'xx.enf.penalty' },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'unknown_rule' })
  })

  it('refuses a change once a notice is sent', async () => {
    const { caseId, findingIds } = await foundCase()
    await chooseCure(caseId)
    await send(caseId, findingIds)
    const result = await applyCureProcedure(
      handle.db,
      world.staff,
      { caseId, ruleKey: null },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'notice_sent' })
  })

  it('refuses staff without the enforcement capability', async () => {
    const { caseId } = await foundCase()
    const result = await applyCureProcedure(
      handle.db,
      world.finance,
      { caseId, ruleKey: XX_CURE_RULE_KEY },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'forbidden' })
  })
})

describe('sending the cure notice', () => {
  it('needs a procedure chosen on the case', async () => {
    const { caseId, findingIds } = await foundCase()
    expect(await send(caseId, findingIds)).toEqual({ ok: false, error: 'no_cure_procedure' })
  })

  it('sends to the owner alone and sets the due date ten days on', async () => {
    const { caseId, findingIds } = await foundCase()
    await chooseCure(caseId)
    const sent = await send(caseId, findingIds)
    if (!sent.ok) throw new Error(sent.error)
    expect(sent.value.ids).toHaveLength(1)
    const rows = await handle.db.select().from(cureNotices).where(eq(cureNotices.caseId, caseId))
    expect(rows.map((r) => r.recipientRole)).toEqual(['owner'])
    expect(rows[0]?.sentOn).toBe(SENT)
    expect(rows[0]?.cureDue.due).toBe(DUE)
    expect(rows[0]?.cureDue.startEvent).toBe('cure_notice_sent')
  })

  it('sends one notice to each recipient when there is an occupant', async () => {
    const { caseId, findingIds } = await foundCase()
    await chooseCure(caseId)
    const sent = await send(caseId, findingIds, OCCUPANT)
    if (!sent.ok) throw new Error(sent.error)
    expect(sent.value.ids).toHaveLength(2)
    const rows = await handle.db.select().from(cureNotices).where(eq(cureNotices.caseId, caseId))
    expect(rows.map((r) => r.recipientRole).sort()).toEqual(['occupant', 'owner'])
  })

  it('refuses a case with no open findings, a finding that is not open and a future date', async () => {
    const { caseId, findingIds } = await foundCase(2)
    await chooseCure(caseId)
    expect(await send(caseId, [])).toEqual({ ok: false, error: 'no_open_findings' })
    const corrected = await markFindingCorrected(
      handle.db,
      world.staff,
      { findingId: findingIds[0] ?? '', correctedOn: '2027-02-25', note: '' },
      signal,
    )
    if (!corrected.ok) throw new Error(corrected.error)
    expect(await send(caseId, findingIds)).toEqual({ ok: false, error: 'finding_not_open' })
    const future = await sendCureNotice(
      handle.db,
      world.staff,
      {
        caseId,
        findingIds: [findingIds[1] ?? ''],
        owner: OWNER,
        occupant: 'none',
        sentOn: d('2027-03-09'),
        documentId: null,
      },
      signal,
      NOW,
    )
    expect(future).toEqual({ ok: false, error: 'future_date' })
  })

  it('records a return receipt for one recipient', async () => {
    const { caseId, findingIds } = await foundCase()
    await chooseCure(caseId)
    const sent = await send(caseId, findingIds, OCCUPANT)
    if (!sent.ok) throw new Error(sent.error)
    const id = sent.value.ids[0] ?? ''
    const done = await recordCureReturnReceipt(
      handle.db,
      world.staff,
      { cureNoticeId: id, receivedOn: d('2027-03-02') },
      signal,
      NOW,
    )
    expect(done.ok).toBe(true)
    const rows = await handle.db.select().from(cureNotices).where(eq(cureNotices.caseId, caseId))
    expect(rows.filter((r) => r.returnReceiptOn !== null)).toHaveLength(1)
  })
})

describe('cure status and the work plan', () => {
  it('shows no remedy before the due date', async () => {
    const { caseId, findingIds } = await foundCase()
    await chooseCure(caseId)
    await send(caseId, findingIds)
    const status = await cureStatus(handle.db, caseId, DUE, signal)
    expect(status.due).toBe(DUE)
    expect(status.lapsedUncorrected).toBe(false)
    const plan = await planOn(caseId, DUE)
    expect(plan.remedies).toEqual([])
    expect(plan.due?.key).toBe('cure')
  })

  it('offers both remedies once the period ran with a noticed finding open', async () => {
    const { caseId, findingIds } = await foundCase()
    await chooseCure(caseId)
    await send(caseId, findingIds)
    const after = d('2027-03-12')
    const status = await cureStatus(handle.db, caseId, after, signal)
    expect(status.lapsedUncorrected).toBe(true)
    expect(status.rule?.key).toBe(XX_CURE_RULE_KEY)
    const plan = await planOn(caseId, after)
    expect(plan.remedies.map((a) => a.kind)).toEqual(['place_hold', 'file_civil_action'])
  })

  it('drops the remedies when the noticed findings are corrected, even with a newer open finding', async () => {
    const { caseId, findingIds } = await foundCase()
    await chooseCure(caseId)
    await send(caseId, findingIds)
    await addFinding(caseId, 5)
    await markFindingCorrected(
      handle.db,
      world.staff,
      { findingId: findingIds[0] ?? '', correctedOn: '2027-03-05', note: '' },
      signal,
    )
    const after = d('2027-03-12')
    expect((await cureStatus(handle.db, caseId, after, signal)).lapsedUncorrected).toBe(false)
    const plan = await planOn(caseId, after)
    expect(plan.remedies).toEqual([])
    expect(plan.now?.action).toEqual({ kind: 'send_cure_notice' })
  })

  it('asks for the cure notice first when a procedure is chosen and none is sent', async () => {
    const { caseId } = await foundCase()
    await chooseCure(caseId)
    const plan = await planOn(caseId, d('2027-03-02'))
    expect(plan.now?.action).toEqual({ kind: 'send_cure_notice' })
  })

  it('shows no cure step on a case with no procedure', async () => {
    const { caseId } = await foundCase()
    const plan = await planOn(caseId, d('2027-03-02'))
    expect(plan.now?.action).toEqual({ kind: 'send_notice' })
    expect(plan.remedies).toEqual([])
  })
})
