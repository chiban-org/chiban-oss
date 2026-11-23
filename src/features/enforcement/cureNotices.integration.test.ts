import { ME_PACK } from '@packs/me'
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cureNotices, documents, documentVersions, enforcementCases, files } from '@/db/schema'
import {
  applyCureProcedure,
  cureStatus,
  recordCureReturnReceipt,
  sendCureNotice,
} from '@/features/enforcement/cureNotices'
import { cureRules } from '@/features/enforcement/cureRules'
import { markFindingCorrected } from '@/features/enforcement/findingChanges'
import { setActivePackForTest } from '@/features/packs/registry'
import type { ObjectStore } from '@/features/storage/objectStore'
import {
  CURE_DUE,
  CURE_NOW,
  CURE_OCCUPANT,
  CURE_OWNER,
  CURE_SENT,
  type CureHelpers,
  cureHelpers,
} from '@/test/cureFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { type EnforcementWorld, setupEnforcementWorld } from '@/test/enforcementFixtures'
import { makeTestStore } from '@/test/objectStore'
import { XX_CURE, XX_CURE_RULE_KEY } from '@/test/packs/xx/cure'
import { pdfText } from '@/test/pdfText'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
const NOW = CURE_NOW
const SENT = CURE_SENT
const DUE = CURE_DUE
const OWNER = CURE_OWNER
const OCCUPANT = CURE_OCCUPANT
let handle: TestDb
let world: EnforcementWorld
let cure: CureHelpers
let store: ObjectStore

beforeAll(() => {
  setActivePackForTest(XX_CURE)
})
afterAll(() => {
  setActivePackForTest(null)
})
beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupEnforcementWorld(handle.db)
  store = (await makeTestStore()).store
  cure = cureHelpers(handle.db, world, store)
})
afterEach(async () => {
  await handle.drop()
})

describe('choosing the cure procedure for a case', () => {
  it('records the rule on the case and lets it be cleared before any notice', async () => {
    const { caseId } = await cure.foundCase()
    await cure.chooseCure(caseId)
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
    const { caseId } = await cure.foundCase()
    const result = await applyCureProcedure(
      handle.db,
      world.staff,
      { caseId, ruleKey: 'xx.enf.penalty' },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'unknown_rule' })
  })

  it('refuses a change once a notice is sent', async () => {
    const { caseId, findingIds } = await cure.foundCase()
    await cure.chooseCure(caseId)
    await cure.send(caseId, findingIds)
    const result = await applyCureProcedure(
      handle.db,
      world.staff,
      { caseId, ruleKey: null },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'notice_sent' })
  })

  it('refuses staff without the enforcement capability', async () => {
    const { caseId } = await cure.foundCase()
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
    const { caseId, findingIds } = await cure.foundCase()
    expect(await cure.send(caseId, findingIds)).toEqual({ ok: false, error: 'no_cure_procedure' })
  })

  it('sends to the owner alone and sets the due date ten days on', async () => {
    const { caseId, findingIds } = await cure.foundCase()
    await cure.chooseCure(caseId)
    const sent = await cure.send(caseId, findingIds)
    if (!sent.ok) throw new Error(sent.error)
    expect(sent.value.ids).toHaveLength(1)
    const rows = await handle.db.select().from(cureNotices).where(eq(cureNotices.caseId, caseId))
    expect(rows.map((r) => r.recipientRole)).toEqual(['owner'])
    expect(rows[0]?.sentOn).toBe(SENT)
    expect(rows[0]?.cureDue.due).toBe(DUE)
    expect(rows[0]?.cureDue.startEvent).toBe('cure_notice_sent')
  })

  it('sends one notice to each recipient when there is an occupant', async () => {
    const { caseId, findingIds } = await cure.foundCase()
    await cure.chooseCure(caseId)
    const sent = await cure.send(caseId, findingIds, OCCUPANT)
    if (!sent.ok) throw new Error(sent.error)
    expect(sent.value.ids).toHaveLength(2)
    const rows = await handle.db.select().from(cureNotices).where(eq(cureNotices.caseId, caseId))
    expect(rows.map((r) => r.recipientRole).sort()).toEqual(['occupant', 'owner'])
  })

  it('refuses a case with no open findings, a finding that is not open and a future date', async () => {
    const { caseId, findingIds } = await cure.foundCase(2)
    await cure.chooseCure(caseId)
    expect(await cure.send(caseId, [])).toEqual({ ok: false, error: 'no_open_findings' })
    const corrected = await markFindingCorrected(
      handle.db,
      world.staff,
      { findingId: findingIds[0] ?? '', correctedOn: '2027-02-25', note: '' },
      signal,
    )
    if (!corrected.ok) throw new Error(corrected.error)
    expect(await cure.send(caseId, findingIds)).toEqual({ ok: false, error: 'finding_not_open' })
    const future = await sendCureNotice(
      handle.db,
      store,
      world.staff,
      {
        caseId,
        findingIds: [findingIds[1] ?? ''],
        owner: OWNER,
        occupant: 'none',
        sentOn: d('2027-03-09'),
      },
      signal,
      NOW,
    )
    expect(future).toEqual({ ok: false, error: 'future_date' })
  })

  it('records a return receipt for one recipient', async () => {
    const { caseId, findingIds } = await cure.foundCase()
    await cure.chooseCure(caseId)
    const sent = await cure.send(caseId, findingIds, OCCUPANT)
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
    const { caseId, findingIds } = await cure.foundCase()
    await cure.chooseCure(caseId)
    await cure.send(caseId, findingIds)
    const status = await cureStatus(handle.db, caseId, DUE, signal)
    expect(status.due).toBe(DUE)
    expect(status.lapsedUncorrected).toBe(false)
    const plan = await cure.planOn(caseId, DUE)
    expect(plan.remedies).toEqual([])
    expect(plan.due?.key).toBe('cure')
  })

  it('offers both remedies once the period ran with a noticed finding open', async () => {
    const { caseId, findingIds } = await cure.foundCase()
    await cure.chooseCure(caseId)
    await cure.send(caseId, findingIds)
    const after = d('2027-03-12')
    const status = await cureStatus(handle.db, caseId, after, signal)
    expect(status.lapsedUncorrected).toBe(true)
    expect(status.rule?.key).toBe(XX_CURE_RULE_KEY)
    const plan = await cure.planOn(caseId, after)
    expect(plan.remedies.map((a) => a.kind)).toEqual([
      'place_hold',
      'file_civil_action',
      'draft_order',
    ])
  })

  it('drops the remedies when the noticed findings are corrected, even with a newer open finding', async () => {
    const { caseId, findingIds } = await cure.foundCase()
    await cure.chooseCure(caseId)
    await cure.send(caseId, findingIds)
    await cure.addFinding(caseId, 5)
    await markFindingCorrected(
      handle.db,
      world.staff,
      { findingId: findingIds[0] ?? '', correctedOn: '2027-03-05', note: '' },
      signal,
    )
    const after = d('2027-03-12')
    expect((await cureStatus(handle.db, caseId, after, signal)).lapsedUncorrected).toBe(false)
    const plan = await cure.planOn(caseId, after)
    expect(plan.remedies).toEqual([])
    expect(plan.now?.action).toEqual({ kind: 'send_cure_notice' })
  })

  it('asks for the cure notice first when a procedure is chosen and none is sent', async () => {
    const { caseId } = await cure.foundCase()
    await cure.chooseCure(caseId)
    const plan = await cure.planOn(caseId, d('2027-03-02'))
    expect(plan.now?.action).toEqual({ kind: 'send_cure_notice' })
  })

  it('shows no cure step on a case with no procedure', async () => {
    const { caseId } = await cure.foundCase()
    const plan = await cure.planOn(caseId, d('2027-03-02'))
    expect(plan.now?.action).toEqual({ kind: 'send_notice' })
    expect(plan.remedies).toEqual([])
  })
})

describe('the cure notice letter', () => {
  beforeEach(() => {
    setActivePackForTest(ME_PACK)
  })
  afterEach(() => {
    setActivePackForTest(XX_CURE)
  })

  async function letterText(documentId: string): Promise<string> {
    const [version] = await handle.db
      .select()
      .from(documentVersions)
      .where(eq(documentVersions.documentId, documentId))
    const [file] = await handle.db
      .select()
      .from(files)
      .where(eq(files.sha256, version?.fileSha256 ?? ''))
    const stream = await store.getStream(file?.storageKey ?? '', signal)
    if (!stream.ok) throw new Error('bytes')
    const text = await pdfText(new Uint8Array(await new Response(stream.value).arrayBuffer()))
    return text.replace(/\s+/g, ' ')
  }

  it('attaches one PDF per recipient naming the recipient, the citation and the cure date', async () => {
    const rule = cureRules()[0]
    if (rule === undefined) throw new Error('no cure rule')
    const { caseId, findingIds } = await cure.foundCase()
    const applied = await applyCureProcedure(
      handle.db,
      world.staff,
      { caseId, ruleKey: rule.key },
      signal,
    )
    if (!applied.ok) throw new Error(applied.error)
    const sent = await cure.send(caseId, findingIds, OCCUPANT)
    if (!sent.ok) throw new Error(sent.error)
    const rows = await handle.db.select().from(cureNotices).where(eq(cureNotices.caseId, caseId))
    expect(rows.map((r) => r.recipientName).sort()).toEqual([OCCUPANT.name, OWNER.name].sort())
    const letters = await handle.db.select().from(documents).where(eq(documents.recordId, caseId))
    expect(letters.map((l) => l.docKind)).toEqual(['enforcement_letter', 'enforcement_letter'])
    for (const row of rows) {
      const text = await letterText(row.documentId ?? '')
      expect(text).toContain(rule.label)
      expect(text).toContain(row.recipientName)
      expect(text).toContain(rule.citation.label)
      expect(text).toContain('Correct the violation by March 11, 2027.')
    }
  })
})
