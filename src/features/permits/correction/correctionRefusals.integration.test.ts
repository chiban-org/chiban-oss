import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applications, auditLog, notificationOutbox, projectParties } from '@/db/schema'
import { checkCorrection } from '@/features/permits/correction/checkCorrection'
import { correctPermit } from '@/features/permits/correction/correctPermit'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { saveAndPublish } from '@/test/configFixtures'
import { CORRECTED_AT, type IssuedPermit, issuedTradePermit } from '@/test/correctionFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeTestStore } from '@/test/objectStore'

const signal = new AbortController().signal
let handle: TestDb
let world: PermitWorld
let store: ObjectStore

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db, { starters: ['nh.starter.electrical'] })
  store = (await makeTestStore()).store
})
afterEach(async () => {
  await handle.drop()
})

const KEEP = { kind: 'keep' } as const

async function publishAmpFee() {
  await saveAndPublish(handle.db, world.admin, 'fee_schedule', 'el-fees', {
    key: 'el-fees',
    lines: [
      {
        code: 'el',
        label: 'Electrical permit fee',
        due: 'at_intake',
        expr: {
          op: 'conditional_multiplier',
          when: { field: 'service_amps', op: 'gt', value: 200 },
          factor: 2,
          of: { op: 'flat', cents: 4500 },
        },
      },
    ],
  })
}

function correctTrade(
  permit: IssuedPermit,
  values: Record<string, unknown>,
  contractor: Parameters<typeof correctPermit>[2]['contractor'] = KEEP,
) {
  return correctPermit(
    handle.db,
    world.staff,
    {
      applicationId: permit.trade.applicationId,
      values: { description: 'Panel upgrade', contractor_license_number: 'EL-1', ...values },
      projectTitle: 'Garage addition',
      contractor,
      reason: 'Correcting the record',
    },
    signal,
    { store, now: CORRECTED_AT },
  )
}

describe('changes that are not corrections', () => {
  it('refuses a change that would change a fee and writes nothing', async () => {
    await publishAmpFee()
    const permit = await issuedTradePermit(handle.db, world, store)
    expect(await correctTrade(permit, { service_amps: 400 })).toEqual({
      ok: false,
      error: 'fee_change',
    })
    const [row] = await handle.db
      .select()
      .from(applications)
      .where(eq(applications.id, permit.trade.applicationId))
    expect(row?.permitRevision).toBe(0)
    expect(
      await handle.db.select().from(auditLog).where(eq(auditLog.action, 'permit.correct')),
    ).toEqual([])
    const check = await checkCorrection(
      handle.db,
      world.staff,
      {
        applicationId: permit.trade.applicationId,
        values: {
          description: 'Panel upgrade',
          contractor_license_number: 'EL-1',
          service_amps: 400,
        },
        contractor: KEEP,
      },
      signal,
    )
    expect(check.ok && check.value.feeChange).toBe(true)
  })

  it('refuses a change to an answer that decides the review', async () => {
    const made = await makeApplication(handle.db, world, {
      state: 'issued',
      values: { classification: 'residential' },
      facts: { classification: 'residential', dwellingUnits: null, afterTheFact: false },
    })
    const done = await correctPermit(
      handle.db,
      world.staff,
      {
        applicationId: made.applicationId,
        values: { classification: 'nonresidential' },
        projectTitle: 'Garage addition',
        contractor: KEEP,
        reason: 'Wrong use',
      },
      signal,
      { store, now: CORRECTED_AT },
    )
    expect(done.ok).toBe(false)
    expect(!done.ok && typeof done.error === 'object' && 'review' in done.error).toBe(true)
  })

  it('refuses an application that is not an issued permit', async () => {
    const made = await makeApplication(handle.db, world, { state: 'under_review' })
    const done = await correctPermit(
      handle.db,
      world.staff,
      {
        applicationId: made.applicationId,
        values: {},
        projectTitle: 'Garage addition',
        contractor: KEEP,
        reason: 'Typo',
      },
      signal,
      { store, now: CORRECTED_AT },
    )
    expect(done).toEqual({ ok: false, error: 'not_correctable' })
  })
})

describe('who is told about a correction', () => {
  async function queued() {
    return await handle.db
      .select()
      .from(notificationOutbox)
      .where(eq(notificationOutbox.event, 'permit_corrected'))
  }

  it('notifies every party with an account, the contractor included', async () => {
    const permit = await issuedTradePermit(handle.db, world, store)
    expect((await correctTrade(permit, { contractor_license_number: 'EL-2' })).ok).toBe(true)
    const recipients = (await queued()).map((r) => r.recipientUserId)
    expect(recipients).toEqual(
      expect.arrayContaining([
        world.applicant.userId,
        permit.owner.userId,
        permit.contractor.userId,
      ]),
    )
  })

  it('also tells a replaced contractor, and lists them before saving', async () => {
    const permit = await issuedTradePermit(handle.db, world, store)
    const replacement = { kind: 'new', name: 'Spark Co' } as const
    const check = await checkCorrection(
      handle.db,
      world.staff,
      {
        applicationId: permit.trade.applicationId,
        values: { description: 'Panel upgrade', contractor_license_number: 'EL-7' },
        contractor: replacement,
      },
      signal,
    )
    expect(check.ok && check.value.notify).toContain('Volt Electric (no longer the contractor)')
    expect(
      (await correctTrade(permit, { contractor_license_number: 'EL-7' }, replacement)).ok,
    ).toBe(true)
    const rows = await queued()
    const removed = rows.find((r) => r.recipientUserId === permit.contractor.userId)
    expect(removed?.payload).toMatchObject({ contractorRemoved: true, revision: 1 })
    const [party] = await handle.db
      .select()
      .from(projectParties)
      .where(eq(projectParties.id, permit.contractorPartyId))
    expect(party?.removedAt).not.toBeNull()
    const active = await handle.db
      .select({ name: projectParties.name })
      .from(projectParties)
      .where(
        and(eq(projectParties.role, 'contractor'), eq(projectParties.projectId, world.projectId)),
      )
    expect(active.map((p) => p.name)).toContain('Spark Co')
  })

  it('a second correction notifies again', async () => {
    const permit = await issuedTradePermit(handle.db, world, store)
    await correctTrade(permit, { contractor_license_number: 'EL-2' })
    await correctTrade(permit, { contractor_license_number: 'EL-3' })
    const toOwner = (await queued()).filter((r) => r.recipientUserId === permit.owner.userId)
    expect(toOwner).toHaveLength(2)
  })
})
