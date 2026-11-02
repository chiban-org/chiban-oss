import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applications, auditLog, clocks, jobEffects, jobRuns } from '@/db/schema'
import { startClocksFor } from '@/features/clocks/startClocks'
import { clocksDailyJob } from '@/jobs/clocksDaily'
import { runJob } from '@/jobs/defineJob'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
let handle: TestDb
let world: PermitWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db)
})
afterEach(async () => {
  await handle.drop()
})

const run = (today: string) => runJob(handle.db, clocksDailyJob, { today: d(today) }, signal)

async function clockOf(applicationId: string, ruleKey: string) {
  const rows = await handle.db.select().from(clocks).where(eq(clocks.applicationId, applicationId))
  return rows.find((c) => c.ruleKey === ruleKey)
}

async function appState(applicationId: string) {
  const [r] = await handle.db.select().from(applications).where(eq(applications.id, applicationId))
  return r?.state
}

async function reviewedApp() {
  const app = await makeApplication(handle.db, world, {
    state: 'under_review',
    facts: { classification: 'residential', dwellingUnits: 1, afterTheFact: false },
  })
  await handle.db.transaction((tx) =>
    startClocksFor(tx, app.applicationId, 'application_completed', d('2027-03-01'), signal),
  )
  return app
}

async function issuedApp(issuedOn = '2027-03-15') {
  const app = await makeApplication(handle.db, world, { state: 'issued', issuedOn })
  await handle.db.transaction((tx) =>
    startClocksFor(tx, app.applicationId, 'permit_issued', d(issuedOn), signal),
  )
  return app
}

describe('clocks.daily', () => {
  it('daily job on 2027-04-01 marks a 2027-03-31 decision clock overdue', async () => {
    const app = await reviewedApp()
    expect((await run('2027-03-31')).ok).toBe(true)
    expect((await clockOf(app.applicationId, 'nh.bp.decision'))?.status).toBe('running')
    expect((await run('2027-04-01')).ok).toBe(true)
    expect((await clockOf(app.applicationId, 'nh.bp.decision'))?.status).toBe('overdue')
  })

  it('daily job on 2028-03-15 leaves a permit issued 2027-03-15 valid and on 2028-03-16 expires it', async () => {
    const app = await issuedApp()
    await run('2028-03-15')
    expect(await appState(app.applicationId)).toBe('issued')
    expect((await clockOf(app.applicationId, 'town.bp.expiration'))?.status).toBe('running')
    await run('2028-03-16')
    expect(await appState(app.applicationId)).toBe('expired')
    expect((await clockOf(app.applicationId, 'town.bp.expiration'))?.status).toBe('lapsed')
  })

  it('daily job twice in a day has one effect', async () => {
    const app = await issuedApp()
    await run('2028-03-16')
    await run('2028-03-16')
    expect(await appState(app.applicationId)).toBe('expired')
    const transitions = await handle.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, 'application.transition'))
    expect(transitions).toHaveLength(1)
    expect(await handle.db.select().from(jobEffects)).toHaveLength(1)
    const [row] = await handle.db.select().from(jobRuns)
    expect(row?.lastSuccessAt).not.toBeNull()
  })

  it('never expires a suspended permit', async () => {
    const app = await issuedApp()
    await handle.db
      .update(applications)
      .set({ state: 'suspended' })
      .where(eq(applications.id, app.applicationId))
    await run('2028-06-01')
    expect(await appState(app.applicationId)).toBe('suspended')
    expect((await clockOf(app.applicationId, 'town.bp.expiration'))?.status).toBe('running')
  })

  it('the dedup key carries the civil date', () => {
    expect(clocksDailyJob.dedupKey({ today: d('2028-03-16') })).toBe('clocks.daily:2028-03-16')
  })
})
