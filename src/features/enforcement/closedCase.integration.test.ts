import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { enforcementCases } from '@/db/schema'
import { openCase, setCaseStatus } from '@/features/enforcement/cases'
import { referToCounsel } from '@/features/enforcement/counsel'
import { applyCureProcedure } from '@/features/enforcement/cureNotices'
import { markFindingCorrected } from '@/features/enforcement/findingChanges'
import { addNote } from '@/features/enforcement/notes'
import { setActivePackForTest } from '@/features/packs/registry'
import type { ObjectStore } from '@/features/storage/objectStore'
import { type CureHelpers, cureHelpers } from '@/test/cureFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { type EnforcementWorld, setupEnforcementWorld } from '@/test/enforcementFixtures'
import { makeTestStore } from '@/test/objectStore'
import { XX_CURE, XX_CURE_RULE_KEY } from '@/test/packs/xx/cure'

const signal = new AbortController().signal
let handle: TestDb
let store: ObjectStore
let world: EnforcementWorld
let cure: CureHelpers

beforeEach(async () => {
  handle = await makeTestDb()
  store = (await makeTestStore()).store
  world = await setupEnforcementWorld(handle.db)
  cure = cureHelpers(handle.db, world)
})
afterEach(async () => {
  setActivePackForTest(null)
  await handle.drop()
})

async function versionOf(caseId: string): Promise<number> {
  const [row] = await handle.db
    .select({ rowVersion: enforcementCases.rowVersion })
    .from(enforcementCases)
    .where(eq(enforcementCases.id, caseId))
  return row?.rowVersion ?? 0
}

async function moveTo(caseId: string, to: 'resolved' | 'closed' | 'no_violation') {
  const moved = await setCaseStatus(
    handle.db,
    world.staff,
    { caseId, to, reason: 'Work restored.', expectedRowVersion: await versionOf(caseId) },
    signal,
  )
  if (!moved.ok) throw new Error(moved.error)
}

function refer(caseId: string) {
  return referToCounsel(
    handle.db,
    store,
    world.staff,
    { caseId, counselName: 'Attorney Rivera', purpose: 'injunction', referredOn: '2027-03-12' },
    signal,
  )
}

describe('a closed case under a pack with a cure procedure', () => {
  beforeEach(() => {
    setActivePackForTest(XX_CURE)
  })

  async function closedCase(): Promise<string> {
    const { caseId, findingIds } = await cure.foundCase()
    const corrected = await markFindingCorrected(
      handle.db,
      world.staff,
      { findingId: findingIds[0] ?? '', correctedOn: '2027-02-25', note: '' },
      signal,
    )
    if (!corrected.ok) throw new Error(corrected.error)
    await moveTo(caseId, 'resolved')
    await moveTo(caseId, 'closed')
    return caseId
  }

  it('refuses a cure procedure choice', async () => {
    const caseId = await closedCase()
    expect(
      await applyCureProcedure(
        handle.db,
        world.staff,
        { caseId, ruleKey: XX_CURE_RULE_KEY },
        signal,
      ),
    ).toEqual({ ok: false, error: 'case_closed' })
  })

  it('refuses a referral to counsel and still takes a note', async () => {
    const caseId = await closedCase()
    expect(await refer(caseId)).toEqual({ ok: false, error: 'case_closed' })
    const noted = await addNote(
      handle.db,
      world.staff,
      { caseId, observedOn: '2027-03-12', body: 'Owner called to confirm the work.' },
      signal,
    )
    expect(noted.ok).toBe(true)
  })
})

describe('a closed case under the default pack', () => {
  it('refuses a referral to counsel', async () => {
    const opened = await openCase(handle.db, world.staff, { locationText: '9 Fern Road' }, signal)
    if (!opened.ok) throw new Error(opened.error)
    const { caseId } = opened.value
    const started = await setCaseStatus(
      handle.db,
      world.staff,
      { caseId, to: 'investigating', expectedRowVersion: 1 },
      signal,
    )
    if (!started.ok) throw new Error(started.error)
    await moveTo(caseId, 'no_violation')
    await moveTo(caseId, 'closed')
    expect(await refer(caseId)).toEqual({ ok: false, error: 'case_closed' })
  })
})
