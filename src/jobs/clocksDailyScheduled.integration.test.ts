import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applications, townSettings } from '@/db/schema'
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
  await handle.db
    .insert(townSettings)
    .values({ name: 'Town of Alder Pond', stateCode: 'NH', timeZone: 'America/New_York' })
    .onConflictDoNothing()
})
afterEach(async () => {
  vi.useRealTimers()
  await handle.drop()
})

describe('the scheduled daily clock run does not claim the sweeper date', () => {
  it('a payload-less run at UTC D and town D-1 leaves the sweeper run for D effective', async () => {
    const app = await makeApplication(handle.db, world, { state: 'issued', issuedOn: '2027-03-15' })
    await handle.db.transaction((tx) =>
      startClocksFor(tx, app.applicationId, 'permit_issued', d('2027-03-15'), signal),
    )
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2028-03-16T01:00:00Z'))
    const scheduled = await runJob(handle.db, clocksDailyJob, {}, signal)
    expect(scheduled.ok).toBe(true)
    const [mid] = await handle.db
      .select()
      .from(applications)
      .where(eq(applications.id, app.applicationId))
    expect(mid?.state).toBe('issued')
    const swept = await runJob(handle.db, clocksDailyJob, { today: d('2028-03-16') }, signal)
    expect(swept.ok).toBe(true)
    const [after] = await handle.db
      .select()
      .from(applications)
      .where(eq(applications.id, app.applicationId))
    expect(after?.state).toBe('expired')
  })
})
