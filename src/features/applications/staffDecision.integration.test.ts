import { ME_PACK } from '@packs/me'
import { and, eq, isNull } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { appealNodes, applications, documents } from '@/db/schema'
import { loadGraphNodeRows } from '@/features/appeals/graphNodeRows'
import { nodeWindow } from '@/features/appeals/nodeWindow'
import { decideStaffApplication } from '@/features/applications/staffDecision'
import { computeRuleDue } from '@/features/clocks/ruleEngine'
import { packHolidayCalendar } from '@/features/packs/holidays'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import { setActivePackForTest } from '@/features/packs/registry'
import type { ObjectStore } from '@/features/storage/objectStore'
import { documentKind } from '@/features/templates/kinds/documentKinds'
import { formatCivilDate } from '@/lib/formatDate'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { appTypeBody, saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { downloadObject } from '@/test/objectBytes'
import { makeTestStore } from '@/test/objectStore'
import { XX_PACK } from '@/test/packs/xx'
import { pdfWording } from '@/test/pdfWording'
import { signedOffReview } from '@/test/reviewFixtures'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const DECIDED_ON = '2027-03-10' as CivilDate
const REASON = 'The shed sits inside the ten foot side setback.'
const LETTER_TITLE = documentKind('permit_decision_letter').title
const ME_BINDINGS =
  ME_PACK.manifest.classifications.find((c) => c.key === 'me.building_permit')?.mandatoryRuleKeys ??
  []
let handle: TestDb
let world: PermitWorld
let store: ObjectStore

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db)
  store = (await makeTestStore()).store
})
afterEach(async () => {
  setActivePackForTest(null)
  await handle.drop()
})

async function maineType() {
  setActivePackForTest(ME_PACK)
  await saveAndPublish(
    handle.db,
    world.admin,
    'application_type',
    'MEBP',
    appTypeBody({
      key: 'MEBP',
      prefix: 'MB',
      classification: 'me.building_permit',
      bindings: ME_BINDINGS,
      templateKeys: [],
    }),
  )
  return 'MEBP'
}

async function underReview(typeKey: string, signedOff: boolean) {
  const made = await makeApplication(
    handle.db,
    world,
    { state: 'under_review' },
    new Date('2027-03-02T15:00:00Z'),
    typeKey,
  )
  if (signedOff) await signedOffReview(handle.db, world, made.applicationId, signal)
  const [row] = await handle.db
    .select({ rowVersion: applications.rowVersion })
    .from(applications)
    .where(eq(applications.id, made.applicationId))
  return { applicationId: made.applicationId, rowVersion: row?.rowVersion ?? 1 }
}

async function decide(typeKey: string, to: 'decided' | 'denied', reason: string | null) {
  const app = await underReview(typeKey, to === 'decided')
  const result = await decideStaffApplication(
    handle.db,
    world.staff,
    {
      applicationId: app.applicationId,
      outcome: to,
      expectedRowVersion: app.rowVersion,
      reason,
      decidedOn: DECIDED_ON,
    },
    store,
    signal,
  )
  return { ...app, result }
}

async function lettersOf(applicationId: string) {
  return await handle.db
    .select({ id: documents.id, audiences: documents.audiences })
    .from(documents)
    .where(
      and(
        eq(documents.recordId, applicationId),
        eq(documents.title, LETTER_TITLE),
        isNull(documents.supersededBy),
      ),
    )
}

async function letterText(applicationId: string) {
  const letters = await lettersOf(applicationId)
  expect(letters).toHaveLength(1)
  const [letter] = letters
  expect(letter?.audiences).toEqual(['project_parties'])
  return (await pdfWording(await downloadObject(handle.db, store, letter?.id ?? ''))).replace(
    /\s+/g,
    ' ',
  )
}

async function decisionNode(applicationId: string) {
  const rows = await loadGraphNodeRows(handle.db, applicationId)
  const nodes = rows.filter((n) => n.kind === 'administrative_decision')
  expect(nodes).toHaveLength(1)
  const [node] = nodes
  if (node === undefined) throw new Error('no node')
  return node
}

describe('a staff decision on a permit without a board', () => {
  it('denying a Maine building permit attaches the letter and opens the appeal window', async () => {
    const typeKey = await maineType()
    const { applicationId, result } = await decide(typeKey, 'denied', REASON)
    expect(result.ok).toBe(true)
    const text = await letterText(applicationId)
    expect(text).toContain(REASON)
    expect(text).toContain(
      'Appeal of an administrative decision to the Board of Appeals: within 30 days after the decision',
    )
    const [stored] = await handle.db
      .select({ reason: applications.decisionReason, state: applications.state })
      .from(applications)
      .where(eq(applications.id, applicationId))
    expect(stored).toEqual({ reason: REASON, state: 'denied' })
    const node = await decisionNode(applicationId)
    expect(node.outcome).toBe('denied')
    expect(node.occurredOn).toBe(DECIDED_ON)
    const rule = ruleByKey(loadPack(), 'me.appeal.admin_to_boa')
    if (rule.kind !== 'clock') throw new Error('not a clock')
    const due = computeRuleDue(rule, { unit: 'days', value: 30 }, DECIDED_ON, packHolidayCalendar())
    const window = await nodeWindow(handle.db, node, signal)
    expect(window?.dueText).toContain(formatCivilDate(due.due))
  })

  it('refuses a denial with no reason and stores nothing', async () => {
    const typeKey = await maineType()
    for (const reason of [null, 'Too big']) {
      const { applicationId, result } = await decide(typeKey, 'denied', reason)
      expect(result).toEqual({ ok: false, error: 'reason_required' })
      expect(await lettersOf(applicationId)).toEqual([])
      expect(
        await handle.db
          .select()
          .from(appealNodes)
          .where(eq(appealNodes.applicationId, applicationId)),
      ).toEqual([])
      const [stored] = await handle.db
        .select({ reason: applications.decisionReason, state: applications.state })
        .from(applications)
        .where(eq(applications.id, applicationId))
      expect(stored).toEqual({ reason: null, state: 'under_review' })
    }
  })

  it('approving a Maine building permit attaches a letter and records an approval', async () => {
    const typeKey = await maineType()
    const { applicationId, result } = await decide(typeKey, 'decided', null)
    expect(result.ok).toBe(true)
    const text = await letterText(applicationId)
    expect(text).toContain('Approved')
    expect(text).not.toContain('Not recorded')
    expect((await decisionNode(applicationId)).outcome).toBe('approved')
  })

  it('a New Hampshire building permit denial prints the New Hampshire appeal rights', async () => {
    const { applicationId, result } = await decide('BP', 'denied', REASON)
    expect(result.ok).toBe(true)
    const text = await letterText(applicationId)
    expect(text).toContain(REASON)
    expect(text).toContain('within 30 days after the decision (RSA 676:5 I)')
    expect((await decisionNode(applicationId)).outcome).toBe('denied')
  })

  it('prints the classification appeal text when the pack states one', async () => {
    setActivePackForTest(XX_PACK)
    await saveAndPublish(
      handle.db,
      world.admin,
      'application_type',
      'XBP',
      appTypeBody({
        key: 'XBP',
        prefix: 'XB',
        classification: 'xx.building_permit',
        bindings:
          XX_PACK.manifest.classifications.find((c) => c.key === 'xx.building_permit')
            ?.mandatoryRuleKeys ?? [],
        templateKeys: [],
      }),
    )
    const { applicationId, result } = await decide('XBP', 'denied', REASON)
    expect(result.ok).toBe(true)
    expect(await letterText(applicationId)).toContain(
      'A decision may be appealed under Vellmora Permit Act 9.',
    )
  })
})
