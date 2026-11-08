import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { notificationOutbox, projectParties, users } from '@/db/schema'
import { type Actor, loadActor } from '@/features/auth/actor'
import { saveContractorProfile } from '@/features/contractors/profile'
import type { NotificationPayload } from '@/features/notifications/queue'
import { checkCorrection } from '@/features/permits/correction/checkCorrection'
import { type CorrectionInput, correctPermit } from '@/features/permits/correction/correctPermit'
import type { ObjectStore } from '@/features/storage/objectStore'
import type { PermitWorld } from '@/test/applicationFixtures'
import { CORRECTED_AT, type IssuedPermit, issuedTradePermit } from '@/test/correctionFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeUser } from '@/test/factories'
import { setupTradeWorld } from '@/test/ledgerFixtures'
import { makeTestStore } from '@/test/objectStore'

const signal = new AbortController().signal
const VALUES = { description: 'Panel upgrade', contractor_license_number: 'EL-5' }
let handle: TestDb
let world: PermitWorld
let store: ObjectStore
let permit: IssuedPermit

beforeEach(async () => {
  handle = await makeTestDb()
  world = (await setupTradeWorld(handle.db)).world
  store = (await makeTestStore()).store
  permit = await issuedTradePermit(handle.db, world, store)
})
afterEach(async () => {
  await handle.drop()
})

async function withProfile(actor: Actor, companyName: string): Promise<void> {
  const saved = await saveContractorProfile(
    handle.db,
    actor,
    {
      name: companyName,
      phone: '603-555-0142',
      mailingAddress: null,
      companyName,
      trades: [],
      licenses: [],
    },
    signal,
  )
  if (!saved.ok) throw new Error('profile')
}

async function emailOf(userId: string): Promise<string> {
  const [row] = await handle.db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
  return row?.email ?? ''
}

function replaceWith(name: string, email: string): CorrectionInput {
  return {
    applicationId: permit.trade.applicationId,
    values: VALUES,
    projectTitle: 'Garage addition',
    contractor: { kind: 'new', name, email },
    reason: 'Wrong contractor on file',
  }
}

const preview = (input: CorrectionInput) =>
  checkCorrection(
    handle.db,
    world.staff,
    { applicationId: input.applicationId, values: input.values, contractor: input.contractor },
    signal,
  )

async function corrected(input: CorrectionInput) {
  const done = await correctPermit(handle.db, world.staff, input, signal, {
    store,
    now: CORRECTED_AT,
  })
  if (!done.ok) throw new Error('correction')
  const rows = await handle.db
    .select()
    .from(notificationOutbox)
    .where(eq(notificationOutbox.event, 'permit_corrected'))
  return rows.map((r) => ({
    userId: r.recipientUserId,
    removed: (r.payload as NotificationPayload).contractorRemoved === true,
  }))
}

describe('a corrected permit naming a contractor with an account', () => {
  it('previews and notifies the contractor account the new party links to', async () => {
    const id = await makeUser(handle.db, { role: 'applicant', email: 'spark@co.example' })
    const spark = (await loadActor(handle.db, id, signal)) as Actor
    await withProfile(spark, 'Spark Co')
    const input = replaceWith('Spark Co', 'spark@co.example')
    const check = await preview(input)
    expect(check.ok && check.value.notify).toContain('Spark Co')
    const notified = await corrected(input)
    expect(notified).toContainEqual({ userId: spark.userId, removed: false })
    const [party] = await handle.db
      .select({ userId: projectParties.userId })
      .from(projectParties)
      .where(eq(projectParties.email, 'spark@co.example'))
    expect(party?.userId).toBe(spark.userId)
  })

  it('sends no removal notice when the replacement is the same account by email', async () => {
    await withProfile(permit.contractor, 'Pat Electric')
    const input = replaceWith('Pat Electric LLC', await emailOf(permit.contractor.userId))
    const check = await preview(input)
    expect(check.ok && check.value.notify).not.toContainEqual(
      expect.stringContaining('no longer the contractor'),
    )
    const notified = await corrected(input)
    expect(notified.filter((n) => n.userId === permit.contractor.userId)).toEqual([
      { userId: permit.contractor.userId, removed: false },
    ])
  })
})
