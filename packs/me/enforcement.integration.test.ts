import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadCaseDetail } from '@/features/enforcement/caseDetail'
import { listCaseQueue } from '@/features/enforcement/caseQueue'
import { applyCureProcedure } from '@/features/enforcement/cureNotices'
import { setActivePackForTest } from '@/features/packs/registry'
import { cureHelpers } from '@/test/cureFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { type EnforcementWorld, setupEnforcementWorld } from '@/test/enforcementFixtures'
import type { CivilDate } from '@/types/civilDate'
import { ME_PACK } from './index'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
let handle: TestDb
let world: EnforcementWorld

beforeEach(async () => {
  setActivePackForTest(ME_PACK)
  handle = await makeTestDb()
  world = await setupEnforcementWorld(handle.db)
})
afterEach(async () => {
  setActivePackForTest(null)
  await handle.drop()
})

describe('a Maine land use case', () => {
  it('shows the statutory range and offers no order step', async () => {
    const cure = cureHelpers(handle.db, world)
    const { caseId } = await cure.foundCase()
    const detail = await loadCaseDetail(handle.db, world.staff, caseId, d('2027-03-12'), signal)
    if (!detail.ok) throw new Error(detail.error)
    const { exposure } = detail.value
    expect(exposure).toMatchObject({ kind: 'range', fromDate: null, days: 0 })
    expect(exposure?.kind === 'range' ? exposure.categories.map((c) => c.key) : []).toEqual([
      'no_permit',
      'specific_violation',
      'resource_protection',
    ])
    const plan = await cure.planOn(caseId, d('2027-03-12'))
    expect(
      plan.groups.flatMap((g) => g.rows.map((r) => r.key)).filter((k) => k.startsWith('order.')),
    ).toEqual([])
    expect(plan.now?.action?.kind).not.toBe('draft_order')
    expect(plan.remedies.map((a) => a.kind)).not.toContain('draft_order')
    const queue = await listCaseQueue(
      handle.db,
      world.staff,
      { filters: {}, limit: 50, offset: 0 },
      d('2027-03-12'),
      signal,
    )
    const row = queue.rows.find((r) => r.caseId === caseId)
    expect(row?.nextStep?.ask ?? '').not.toContain('order')
  })
})

describe('a Maine shoreland case', () => {
  it('sends the cure notice, then opens the hold and civil action after 10 days uncorrected', async () => {
    const cure = cureHelpers(handle.db, world)
    const { caseId, findingIds } = await cure.foundCase()
    const applied = await applyCureProcedure(
      handle.db,
      world.staff,
      { caseId, ruleKey: 'me.enf.cure' },
      signal,
    )
    expect(applied.ok).toBe(true)
    expect((await cure.planOn(caseId, d('2027-03-02'))).now?.action).toEqual({
      kind: 'send_cure_notice',
    })
    const sent = await cure.send(caseId, findingIds)
    if (!sent.ok) throw new Error(sent.error)
    const onDue = await cure.planOn(caseId, d('2027-03-11'))
    expect(onDue.remedies).toEqual([])
    expect(onDue.due?.key).toBe('cure')
    const after = await cure.planOn(caseId, d('2027-03-12'))
    expect(after.remedies.map((a) => a.kind)).toEqual(['place_hold', 'file_civil_action'])
  })
})
