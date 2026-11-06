import { and, eq, isNull } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { projectParties } from '@/db/schema'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { sendQueuedNotifications } from '@/features/notifications/send'
import { type CorrectionInput, correctPermit } from '@/features/permits/correction/correctPermit'
import type { ObjectStore } from '@/features/storage/objectStore'
import type { PermitWorld } from '@/test/applicationFixtures'
import {
  CORRECTED_AT,
  type IssuedPermit,
  issuedTrade,
  issuedTradePermit,
} from '@/test/correctionFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { setupTradeWorld } from '@/test/ledgerFixtures'
import { makeTestStore } from '@/test/objectStore'

const signal = new AbortController().signal
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

function replaceWith(applicationId: string, name: string): CorrectionInput {
  return {
    applicationId,
    values: { description: 'Panel upgrade', contractor_license_number: 'EL-5' },
    projectTitle: 'Garage addition',
    contractor: { kind: 'new', name },
    reason: 'Wrong contractor on file',
  }
}

describe('delivering correction notices', () => {
  it('mails the replaced contractor even though they can no longer open the permit', async () => {
    const done = await correctPermit(
      handle.db,
      world.staff,
      replaceWith(permit.trade.applicationId, 'Spark Co'),
      signal,
      { store, now: CORRECTED_AT },
    )
    expect(done.ok).toBe(true)
    const mail = createMemoryTransport()
    await sendQueuedNotifications(handle.db, mail, signal, CORRECTED_AT)
    const [contractor] = await handle.db.query.users.findMany({
      where: (u, { eq: is }) => is(u.id, permit.contractor.userId),
    })
    const toContractor = mail.sent.filter((m) => m.to === contractor?.email)
    expect(toContractor.map((m) => m.subject)).toContain(`Permit ${permit.trade.number} corrected`)
  })
})

describe('corrections on two permits of one project', () => {
  it('leave one contractor on the project when both replace it at once', async () => {
    const other = await issuedTrade(handle.db, world, store)
    const results = await Promise.all([
      correctPermit(
        handle.db,
        world.staff,
        replaceWith(permit.trade.applicationId, 'Spark Co'),
        signal,
        {
          store,
          now: CORRECTED_AT,
        },
      ),
      correctPermit(handle.db, world.staff, replaceWith(other.applicationId, 'Bolt Bros'), signal, {
        store,
        now: CORRECTED_AT,
      }),
    ])
    expect(results.every((r) => r.ok)).toBe(true)
    const contractors = await handle.db
      .select({ name: projectParties.name })
      .from(projectParties)
      .where(
        and(
          eq(projectParties.projectId, world.projectId),
          eq(projectParties.role, 'contractor'),
          isNull(projectParties.removedAt),
        ),
      )
    expect(contractors).toHaveLength(1)
  })
})
