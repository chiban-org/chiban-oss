import { eq, sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applications } from '@/db/schema'
import { lockApplication } from '@/features/applications/lockApplication'
import { startCounterIntake } from '@/features/counter/intake/startIntake'
import { submitCounterIntake } from '@/features/counter/intake/submitIntake'
import { saveDraftValues } from '@/features/portal/drafts'
import { type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { blockedOrSettled, holdOpen } from '@/test/lockWait'

const signal = new AbortController().signal
const NOW = new Date('2028-01-03T16:00:00Z')
let handle: TestDb
let world: BoardWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db)
})
afterEach(async () => {
  await handle.drop()
})

async function savedDraft(): Promise<string> {
  const started = await startCounterIntake(
    handle.db,
    world.staff,
    {
      parcelId: world.parcelId,
      applicationTypeKey: world.zbaTypeKey,
      applicant: { name: 'Morgan Reyes' },
      now: NOW,
    },
    signal,
  )
  if (!started.ok) throw new Error('start failed')
  const { applicationId } = started.value
  await saveDraftValues(
    handle.db,
    world.staff,
    { applicationId, values: { classification: 'residential' } },
    signal,
  )
  return applicationId
}

describe('submitting a counter application while a save is in flight', () => {
  it('waits for the save and submits the newest answers', async () => {
    const applicationId = await savedDraft()
    const saving = await holdOpen(handle.db, async (tx) => {
      await lockApplication(tx, applicationId)
      await tx
        .update(applications)
        .set({
          values: { classification: 'nonresidential' },
          rowVersion: sql`${applications.rowVersion} + 1`,
        })
        .where(eq(applications.id, applicationId))
    })
    const submitting = submitCounterIntake(
      handle.db,
      world.staff,
      { applicationId, signedOnPaper: true, now: NOW },
      signal,
    )
    expect(await blockedOrSettled(handle.db, submitting)).toBe('blocked')
    await saving.commit()
    expect((await submitting).ok).toBe(true)
    const [app] = await handle.db
      .select({ state: applications.state, values: applications.values })
      .from(applications)
      .where(eq(applications.id, applicationId))
    expect(app).toEqual({ state: 'submitted', values: { classification: 'nonresidential' } })
  })
})
