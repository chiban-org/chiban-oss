import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applications, clocks, codeEditionRecords } from '@/db/schema'
import { loadApplicationContext } from '@/features/applications/context'
import { recordCodeEdition } from '@/features/building/codeEdition'
import { markComplete } from '@/features/building/completeness'
import { evaluateGates } from '@/features/gates/evaluateGates'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
const NOW = new Date('2027-06-01T12:00:00Z')
let handle: TestDb
let world: PermitWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db)
})
afterEach(async () => {
  await handle.drop()
})

function submittedApp(facts: object, receivedDate = '2027-03-01') {
  return makeApplication(handle.db, world, { state: 'submitted', receivedDate, facts })
}

async function complete(applicationId: string, on: string, actor = world.staff) {
  return await markComplete(handle.db, actor, { applicationId, completedDate: d(on) }, signal, NOW)
}

async function decisionDue(applicationId: string) {
  const rows = await handle.db.select().from(clocks).where(eq(clocks.applicationId, applicationId))
  return rows.find((c) => c.ruleKey === 'nh.bp.decision')?.currentDue
}

describe('markComplete', () => {
  it('residential one unit completed 2027-03-01 is due 2027-03-31', async () => {
    const app = await submittedApp({
      classification: 'residential',
      dwellingUnits: 1,
      afterTheFact: false,
    })
    expect((await complete(app.applicationId, '2027-03-01')).ok).toBe(true)
    expect(await decisionDue(app.applicationId)).toBe('2027-03-31')
  })

  it('nonresidential completed 2027-03-01 is due 2027-04-30', async () => {
    const app = await submittedApp({
      classification: 'nonresidential',
      dwellingUnits: null,
      afterTheFact: false,
    })
    await complete(app.applicationId, '2027-03-01')
    expect(await decisionDue(app.applicationId)).toBe('2027-04-30')
  })

  it('residential 11 units is 60 days; 10 units is 30', async () => {
    const eleven = await submittedApp({
      classification: 'residential',
      dwellingUnits: 11,
      afterTheFact: false,
    })
    const ten = await submittedApp({
      classification: 'residential',
      dwellingUnits: 10,
      afterTheFact: false,
    })
    await complete(eleven.applicationId, '2027-03-01')
    await complete(ten.applicationId, '2027-03-01')
    expect(await decisionDue(eleven.applicationId)).toBe('2027-04-30')
    expect(await decisionDue(ten.applicationId)).toBe('2027-03-31')
  })

  it('the clock runs from completeness, not receipt', async () => {
    const app = await submittedApp(
      { classification: 'residential', dwellingUnits: 1, afterTheFact: false },
      '2027-02-01',
    )
    await complete(app.applicationId, '2027-02-20')
    expect(await decisionDue(app.applicationId)).toBe('2027-03-22')
  })

  it('completeness date before receipt is refused', async () => {
    const app = await submittedApp({
      classification: 'residential',
      dwellingUnits: 1,
      afterTheFact: false,
    })
    expect(await complete(app.applicationId, '2027-02-28')).toEqual({
      ok: false,
      error: 'before_receipt',
    })
    expect(await decisionDue(app.applicationId)).toBeUndefined()
  })

  it('a completeness date in the future is refused', async () => {
    const app = await submittedApp({
      classification: 'residential',
      dwellingUnits: 1,
      afterTheFact: false,
    })
    expect(await complete(app.applicationId, '2027-06-02')).toEqual({
      ok: false,
      error: 'future_date',
    })
  })

  it('a draft is not_submitted and a reviewer is forbidden', async () => {
    const draft = await makeApplication(handle.db, world)
    expect(await complete(draft.applicationId, '2027-03-01')).toEqual({
      ok: false,
      error: 'not_submitted',
    })
    const app = await submittedApp({
      classification: 'residential',
      dwellingUnits: 1,
      afterTheFact: false,
    })
    expect(await complete(app.applicationId, '2027-03-01', world.reviewer)).toEqual({
      ok: false,
      error: 'forbidden',
    })
  })

  it('marking complete twice is already_complete and leaves the clock alone', async () => {
    const app = await submittedApp({
      classification: 'residential',
      dwellingUnits: 1,
      afterTheFact: false,
    })
    await complete(app.applicationId, '2027-03-01')
    expect(await complete(app.applicationId, '2027-03-05')).toEqual({
      ok: false,
      error: 'already_complete',
    })
    expect(await decisionDue(app.applicationId)).toBe('2027-03-31')
  })

  it('stores the completed date on the application', async () => {
    const app = await submittedApp({
      classification: 'residential',
      dwellingUnits: 1,
      afterTheFact: false,
    })
    await complete(app.applicationId, '2027-03-05')
    const [row] = await handle.db
      .select()
      .from(applications)
      .where(eq(applications.id, app.applicationId))
    expect(row?.completedDate).toBe('2027-03-05')
  })
})
