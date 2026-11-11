import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applications, projectParties } from '@/db/schema'
import { type Actor, loadActor } from '@/features/auth/actor'
import { endApplication } from '@/features/portal/endApplication'
import type { PermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeUser } from '@/test/factories'
import { setupTradeWorld, submittedTrade } from '@/test/ledgerFixtures'

const signal = new AbortController().signal
let handle: TestDb
let world: PermitWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = (await setupTradeWorld(handle.db)).world
})
afterEach(async () => {
  await handle.drop()
})

async function contractorOnProject(): Promise<Actor> {
  const userId = await makeUser(handle.db, { role: 'contractor', email: 'pat@alderpond.example' })
  await handle.db.insert(projectParties).values({
    projectId: world.projectId,
    userId,
    email: 'pat@alderpond.example',
    name: 'Pat',
    role: 'contractor',
    addedBy: world.staff.userId,
  })
  return (await loadActor(handle.db, userId, signal)) as Actor
}

async function rowVersionOf(applicationId: string): Promise<number> {
  const [row] = await handle.db
    .select({ rowVersion: applications.rowVersion })
    .from(applications)
    .where(eq(applications.id, applicationId))
  return row?.rowVersion ?? -1
}

describe('contractor withdrawing an application', () => {
  it('withdraws a submitted application the contractor is a party to', async () => {
    const trade = await submittedTrade(handle.db, world)
    const contractor = await contractorOnProject()
    const ended = await endApplication(
      handle.db,
      contractor,
      {
        applicationId: trade.applicationId,
        expectedRowVersion: await rowVersionOf(trade.applicationId),
        ending: 'withdraw',
      },
      signal,
    )
    expect(ended).toEqual({ ok: true, value: undefined })
    const [row] = await handle.db
      .select({ state: applications.state })
      .from(applications)
      .where(eq(applications.id, trade.applicationId))
    expect(row?.state).toBe('withdrawn')
  })

  it('still refuses a contractor who is not on the project', async () => {
    const trade = await submittedTrade(handle.db, world)
    const userId = await makeUser(handle.db, { role: 'contractor', email: 'lee@alderpond.example' })
    const stranger = (await loadActor(handle.db, userId, signal)) as Actor
    const ended = await endApplication(
      handle.db,
      stranger,
      {
        applicationId: trade.applicationId,
        expectedRowVersion: await rowVersionOf(trade.applicationId),
        ending: 'withdraw',
      },
      signal,
    )
    expect(ended.ok).toBe(false)
  })
})
