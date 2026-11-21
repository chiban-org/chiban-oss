import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { appealNodes } from '@/db/schema'
import { addAppealNode } from '@/features/appeals/graph'
import { setActivePackForTest } from '@/features/packs/registry'
import type { AppealRoute, ClockRule } from '@/features/packs/schema'
import {
  BOARD_FIXTURE_NOW,
  type BoardWorld,
  setupBoardWorld,
  submitBoardApplication,
} from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { HEARING_DATE } from '@/test/deliveryFixtures'
import { XX_PACK } from '@/test/packs/xx'
import { xxPackWith } from '@/test/packs/xx/variants'
import type { CivilDate } from '@/types/civilDate'

const ACT = 'https://laws.example/vellmora/permit-act'
const CITATION = { label: 'Vellmora Permit Act 21', url: ACT }
const signal = new AbortController().signal
const d = (s: string) => s as CivilDate

function window(key: string, label: string, days: number, startEvent: ClockRule['startEvent']) {
  const rule: ClockRule = {
    kind: 'clock',
    key,
    version: 1,
    label,
    citation: CITATION,
    clockType: 'filing_window',
    whose: 'third_party',
    startEvent,
    length: { unit: 'days', value: days },
    direction: 'after',
    consequence: { kind: 'appeal_untimely', text: 'The filing is late.' },
    extension: { allowed: false, note: 'The act provides no extension.' },
    waivable: false,
    overridePolicy: { policy: 'fixed' },
  }
  return rule
}

const RECONSIDER = window('xx.appeal.reconsider', 'Motion to reconsider', 20, 'board_vote')
const COURT_DIRECT = window(
  'xx.appeal.court_direct',
  'Court appeal of the decision',
  10,
  'board_vote',
)
const COURT_AFTER = window(
  'xx.appeal.court_after',
  'Court appeal after reconsideration',
  15,
  'rehearing_vote',
)

const ROUTES: AppealRoute[] = [
  { from: 'zba_appeal', to: 'zba_decision', windowRuleKey: null, citation: CITATION },
  {
    from: 'zba_decision',
    to: 'court_petition',
    windowRuleKey: COURT_DIRECT.key,
    citation: CITATION,
  },
  {
    from: 'zba_decision',
    to: 'rehearing_motion',
    windowRuleKey: RECONSIDER.key,
    citation: CITATION,
  },
  { from: 'rehearing_motion', to: 'rehearing_outcome', windowRuleKey: null, citation: CITATION },
  {
    from: 'rehearing_outcome',
    when: { outcome: 'denied', label: 'reconsideration refused' },
    to: 'court_petition',
    windowRuleKey: COURT_AFTER.key,
    citation: CITATION,
  },
  {
    from: 'rehearing_outcome',
    when: { outcome: 'granted', label: 'reconsideration allowed' },
    to: 'zba_decision',
    windowRuleKey: null,
    citation: CITATION,
  },
]

const PACK = (() => {
  const rules = [...XX_PACK.manifest.rules, RECONSIDER, COURT_DIRECT, COURT_AFTER]
  return xxPackWith({
    manifest: { rules },
    pack: { ruleAreas: [{ title: 'All rules', rules }], appealRoutes: ROUTES },
  })
})()

let handle: TestDb
let world: BoardWorld
let applicationId = ''

beforeAll(async () => {
  setActivePackForTest(PACK)
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db, {
    zbaMeetings: [HEARING_DATE],
    pack: PACK,
    classificationKey: 'xx.board_variance',
  })
  applicationId = await submitBoardApplication(handle.db, world, world.zbaTypeKey, '2027-03-02')
})
afterAll(async () => {
  setActivePackForTest(null)
  await handle.drop()
})

async function decisionNode(occurredOn = '2027-04-15'): Promise<string> {
  const [row] = await handle.db
    .insert(appealNodes)
    .values({
      kind: 'zba_decision',
      applicationId,
      occurredOn,
      outcome: 'approved',
      createdBy: world.staff.userId,
    })
    .returning({ id: appealNodes.id })
  return row?.id ?? ''
}

async function add(
  parentId: string,
  kind: Parameters<typeof addAppealNode>[2]['kind'],
  occurredOn: string,
  extra: Partial<Parameters<typeof addAppealNode>[2]> = {},
) {
  return await addAppealNode(
    handle.db,
    world.staff,
    { parentId, kind, occurredOn: d(occurredOn), ...extra },
    signal,
    BOARD_FIXTURE_NOW,
  )
}

async function untimely(nodeId: string): Promise<boolean> {
  const rows = await handle.db.query.appealNodes.findMany({
    where: (n, { eq }) => eq(n.id, nodeId),
  })
  return rows[0]?.untimely ?? false
}

describe('an appeal chain under a fictional pack', () => {
  it('takes the decision to court inside the pack window', async () => {
    const parent = await decisionNode()
    const timely = await add(parent, 'court_petition', '2027-04-25')
    if (!timely.ok) throw new Error(timely.error)
    expect(await untimely(timely.value.nodeId)).toBe(false)
    const parentTwo = await decisionNode('2027-04-16')
    const late = await add(parentTwo, 'court_petition', '2027-04-27')
    if (!late.ok) throw new Error(late.error)
    expect(await untimely(late.value.nodeId)).toBe(true)
  })

  it('files the reconsideration motion against the pack window', async () => {
    const parent = await decisionNode()
    const timely = await add(parent, 'rehearing_motion', '2027-05-05')
    if (!timely.ok) throw new Error(timely.error)
    expect(await untimely(timely.value.nodeId)).toBe(false)
    const lateParent = await decisionNode('2027-04-16')
    const late = await add(lateParent, 'rehearing_motion', '2027-05-07')
    if (!late.ok) throw new Error(late.error)
    expect(await untimely(late.value.nodeId)).toBe(true)
  })

  it('routes a refused reconsideration to court by outcome, not by label text', async () => {
    const parent = await decisionNode()
    const motion = await add(parent, 'rehearing_motion', '2027-05-01')
    if (!motion.ok) throw new Error(motion.error)
    const outcome = await add(motion.value.nodeId, 'rehearing_outcome', '2027-05-10', {
      outcome: 'denied',
    })
    if (!outcome.ok) throw new Error(outcome.error)
    const timely = await add(outcome.value.nodeId, 'court_petition', '2027-05-25')
    if (!timely.ok) throw new Error(timely.error)
    expect(await untimely(timely.value.nodeId)).toBe(false)
  })

  it('sends an allowed reconsideration back to a decision and not to court', async () => {
    const parent = await decisionNode()
    const motion = await add(parent, 'rehearing_motion', '2027-05-01')
    if (!motion.ok) throw new Error(motion.error)
    const outcome = await add(motion.value.nodeId, 'rehearing_outcome', '2027-05-10', {
      outcome: 'granted',
    })
    if (!outcome.ok) throw new Error(outcome.error)
    expect(await add(outcome.value.nodeId, 'court_petition', '2027-05-12')).toEqual({
      ok: false,
      error: 'route_not_allowed',
    })
    const again = await add(outcome.value.nodeId, 'zba_decision', '2027-05-20', {
      outcome: 'approved',
    })
    expect(again.ok).toBe(true)
  })
})
