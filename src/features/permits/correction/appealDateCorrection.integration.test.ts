import { ADMIN_APPEAL_STARTER } from '@packs/me/starters/boards/adminAppeal'
import { ADMINISTRATIVE_APPEAL_STARTER } from '@packs/nh/starters/boards/zba'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applications, configVersions } from '@/db/schema'
import { loadApplicationContext } from '@/features/applications/context'
import type { FormBody, FormField } from '@/features/forms/formSchema'
import type { StarterBundle } from '@/features/packs/schema'
import { correctPermit } from '@/features/permits/correction/correctPermit'
import type { ObjectStore } from '@/features/storage/objectStore'
import type { PermitWorld } from '@/test/applicationFixtures'
import { CORRECTED_AT, type IssuedPermit, issuedTradePermit } from '@/test/correctionFixtures'
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

function decisionDateOf(starter: StarterBundle): FormField {
  const field = starter.form.fields.find((f) => f.key === 'decision_date')
  if (field?.fact !== 'appealedDecisionDate') throw new Error(`${starter.id} has no tagged date`)
  return field
}

async function withAppealDate(field: FormField): Promise<Record<string, unknown>> {
  const id = permit.trade.applicationId
  const app = await loadApplicationContext(handle.db, id, signal)
  if (app === null) throw new Error('no application')
  const [version] = await handle.db
    .select()
    .from(configVersions)
    .where(eq(configVersions.id, app.pins.form))
  const body = version?.body as FormBody
  await handle.db
    .update(configVersions)
    .set({ body: { ...body, fields: [...body.fields, field] } })
    .where(eq(configVersions.id, app.pins.form))
  const values = { ...app.values, decision_date: '2027-02-01' }
  await handle.db.update(applications).set({ values }).where(eq(applications.id, id))
  return values
}

describe('correcting the date of an appealed decision on an issued permit', () => {
  for (const starter of [ADMINISTRATIVE_APPEAL_STARTER, ADMIN_APPEAL_STARTER]) {
    it(`goes through for the ${starter.id} decision date`, async () => {
      const values = await withAppealDate(decisionDateOf(starter))
      const done = await correctPermit(
        handle.db,
        world.staff,
        {
          applicationId: permit.trade.applicationId,
          values: { ...values, decision_date: '2027-02-03' },
          projectTitle: 'Garage addition',
          contractor: { kind: 'keep' },
          reason: 'The decision date was mistyped',
        },
        signal,
        { store, now: CORRECTED_AT },
      )
      expect(done.ok, JSON.stringify(done.ok ? null : done.error)).toBe(true)
      const [row] = await handle.db
        .select({ values: applications.values })
        .from(applications)
        .where(eq(applications.id, permit.trade.applicationId))
      expect(row?.values).toMatchObject({ decision_date: '2027-02-03' })
    })
  }
})
