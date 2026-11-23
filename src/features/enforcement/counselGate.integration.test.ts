import { ME_PACK } from '@packs/me'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { referToCounsel } from '@/features/enforcement/counsel'
import { applyCureProcedure } from '@/features/enforcement/cureNotices'
import { cureRules } from '@/features/enforcement/cureRules'
import { setActivePackForTest } from '@/features/packs/registry'
import type { ObjectStore } from '@/features/storage/objectStore'
import { type CureHelpers, cureHelpers } from '@/test/cureFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { type EnforcementWorld, setupEnforcementWorld } from '@/test/enforcementFixtures'
import { sendFixtureNotice } from '@/test/enforcementNoticeFixture'
import { makeTestStore } from '@/test/objectStore'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const TODAY = '2027-03-02' as CivilDate
let handle: TestDb
let store: ObjectStore
let world: EnforcementWorld
let cure: CureHelpers

beforeEach(async () => {
  setActivePackForTest(ME_PACK)
  handle = await makeTestDb()
  store = (await makeTestStore()).store
  world = await setupEnforcementWorld(handle.db)
  cure = cureHelpers(handle.db, world)
})
afterEach(async () => {
  setActivePackForTest(null)
  await handle.drop()
})

function refer(caseId: string) {
  return referToCounsel(
    handle.db,
    store,
    world.staff,
    { caseId, counselName: 'Attorney Rivera', purpose: 'injunction', referredOn: TODAY },
    signal,
  )
}

async function chooseShorelandCure(caseId: string): Promise<void> {
  const applied = await applyCureProcedure(
    handle.db,
    world.staff,
    { caseId, ruleKey: cureRules()[0]?.key ?? '' },
    signal,
  )
  if (!applied.ok) throw new Error(applied.error)
}

describe('referring a case with no statutory order to counsel', () => {
  it('is refused before any notice is sent', async () => {
    const { caseId } = await cure.foundCase()
    expect(await refer(caseId)).toEqual({ ok: false, error: 'counsel_notice_required' })
  })

  it('is allowed after a notice of violation, with no receipt recorded', async () => {
    const { caseId, findingIds } = await cure.foundCase()
    await sendFixtureNotice(handle.db, store, world.staff, {
      caseId,
      findingId: findingIds[0] ?? '',
      sentOn: '2027-03-01',
    })
    expect((await refer(caseId)).ok).toBe(true)
  })

  it('is allowed after a cure notice, with no return receipt recorded', async () => {
    const { caseId, findingIds } = await cure.foundCase()
    await chooseShorelandCure(caseId)
    const sent = await cure.send(caseId, findingIds)
    if (!sent.ok) throw new Error(sent.error)
    expect((await refer(caseId)).ok).toBe(true)
  })
})

describe('the notice requirements on a cure case', () => {
  it('name the cure notice and say the return receipt is not needed to refer', async () => {
    const { caseId } = await cure.foundCase()
    await chooseShorelandCure(caseId)
    const plan = await cure.planOn(caseId, TODAY)
    const rows = plan.groups.flatMap((g) => g.rows)
    expect(rows.map((r) => [r.key, r.label, r.detail])).toEqual([
      ['finding', 'Finding recorded', ''],
      ['notice.sent', 'Cure notice mailed', ''],
      [
        'notice.received',
        'Return receipt recorded',
        'Not required to refer. A refused certified letter never comes back.',
      ],
    ])
  })

  it('keep the notice of violation labels on a case with no cure procedure', async () => {
    const { caseId } = await cure.foundCase()
    const plan = await cure.planOn(caseId, TODAY)
    expect(plan.groups.flatMap((g) => g.rows.map((r) => r.label))).toEqual([
      'Finding recorded',
      'Notice of violation sent',
      'Receipt of the notice recorded',
    ])
  })
})
