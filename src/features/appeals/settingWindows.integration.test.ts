import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  loadAdministrativeAppeals,
  recordAdministrativeDecision,
} from '@/features/appeals/adminAppeals'
import { addAppealNode } from '@/features/appeals/graph'
import { setActivePackForTest } from '@/features/packs/registry'
import { makeApplication } from '@/test/applicationFixtures'
import { BOARD_FIXTURE_NOW, type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  XX_APPEAL_PERIOD_SETTING_KEY,
  XX_TOWN_SET_APPEAL_WINDOW,
} from '@/test/packs/xx/settingVariants'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
const DECIDED = '2027-03-03'
let handle: TestDb
let world: BoardWorld

beforeAll(() => {
  setActivePackForTest(XX_TOWN_SET_APPEAL_WINDOW)
})
afterAll(() => {
  setActivePackForTest(null)
})
beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db, {
    pack: XX_TOWN_SET_APPEAL_WINDOW,
    classificationKey: 'xx.board_variance',
  })
})
afterEach(async () => {
  await handle.drop()
})

async function publishDays(value: number) {
  await saveAndPublish(handle.db, world.admin, 'town_rule_setting', XX_APPEAL_PERIOD_SETTING_KEY, {
    ruleKey: XX_APPEAL_PERIOD_SETTING_KEY,
    value,
    adoptingAuthority: 'Select Board',
    adoptedOn: '2027-01-05',
  })
}

async function decision(): Promise<{ nodeId: string; number: string }> {
  const permit = await makeApplication(handle.db, world, { state: 'issued' })
  const result = await recordAdministrativeDecision(
    handle.db,
    world.staff,
    { applicationNumber: permit.number, occurredOn: d(DECIDED), now: BOARD_FIXTURE_NOW },
    signal,
  )
  if (!result.ok) throw new Error(result.error)
  return { nodeId: result.value.nodeId, number: permit.number }
}

async function appealOn(parentId: string, on: string) {
  const result = await addAppealNode(
    handle.db,
    world.staff,
    { parentId, kind: 'zba_appeal', occurredOn: d(on), appellantName: 'Lee Abbott' },
    signal,
    BOARD_FIXTURE_NOW,
  )
  if (!result.ok) throw new Error(result.error)
  const [row] = await handle.db.query.appealNodes.findMany({
    where: (n, { eq }) => eq(n.id, result.value.nodeId),
  })
  return row?.untimely ?? false
}

async function statusText(number: string): Promise<string | undefined> {
  const lines = await loadAdministrativeAppeals(handle.db, world.staff, signal)
  return lines?.find((l) => l.applicationNumber === number)?.statusText
}

describe('an administrative appeal window set by the town', () => {
  it('follows the setting default when nothing is published', async () => {
    const { number } = await decision()
    expect(await statusText(number)).toBe('Not appealed. The appeal window ends March 23, 2027.')
  })

  it('follows the published value', async () => {
    const { number } = await decision()
    await publishDays(25)
    expect(await statusText(number)).toBe('Not appealed. The appeal window ends March 29, 2027.')
  })

  it('treats an appeal on day 21 as untimely only under the 20-day value', async () => {
    const { nodeId } = await decision()
    expect(await appealOn(nodeId, '2027-03-24')).toBe(true)
    const second = await decision()
    await publishDays(25)
    expect(await appealOn(second.nodeId, '2027-03-24')).toBe(false)
  })
})
