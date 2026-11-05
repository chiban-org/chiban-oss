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

describe('code edition record', () => {
  async function codeGate(applicationId: string) {
    const app = await loadApplicationContext(handle.db, applicationId, signal)
    if (app === null) throw new Error('missing')
    const results = await handle.db.transaction((tx) =>
      evaluateGates(tx, app, 'issued', d('2027-06-01'), signal),
    )
    return results.find((g) => g.key === 'nh.bp.code_edition_recorded')
  }

  it('issuance without a code edition record is blocked by a statutory gate', async () => {
    const app = await submittedApp({
      classification: 'residential',
      dwellingUnits: 1,
      afterTheFact: false,
    })
    const gate = await codeGate(app.applicationId)
    expect(gate).toMatchObject({ kind: 'statutory', effective: 'blocked' })
    const recorded = await recordCodeEdition(
      handle.db,
      world.staff,
      { applicationId: app.applicationId },
      signal,
    )
    expect(recorded.ok).toBe(true)
    expect((await codeGate(app.applicationId))?.effective).toBe('pass')
  })

  it('records the edition in force at the receipt date from the pack', async () => {
    const app = await submittedApp(
      { classification: 'residential', dwellingUnits: 2, afterTheFact: false },
      '2027-03-01',
    )
    await complete(app.applicationId, '2027-03-02')
    await recordCodeEdition(handle.db, world.staff, { applicationId: app.applicationId }, signal)
    const [rec] = await handle.db
      .select()
      .from(codeEditionRecords)
      .where(eq(codeEditionRecords.applicationId, app.applicationId))
    expect(rec).toMatchObject({
      receiptDate: '2027-03-01',
      completedDate: '2027-03-02',
      classification: 'residential',
      dwellingUnits: 2,
      editionKey: 'nh.edition.2024_07_01',
      editionStatus: 'verified',
      applicantElection: null,
    })
    expect(rec?.editionLabel).toContain('IBC 2021')
  })

  it('a receipt before 2024-07-01 records the explicit unverified edition', async () => {
    const app = await submittedApp(
      { classification: 'residential', dwellingUnits: 1, afterTheFact: false },
      '2024-03-01',
    )
    await recordCodeEdition(handle.db, world.staff, { applicationId: app.applicationId }, signal)
    const [rec] = await handle.db
      .select()
      .from(codeEditionRecords)
      .where(eq(codeEditionRecords.applicationId, app.applicationId))
    expect(rec).toMatchObject({
      editionKey: 'nh.edition.unverified_before_2024_07_01',
      editionStatus: 'unverified',
    })
    expect(rec?.editionLabel).toMatch(/not verified/i)
  })

  it('an election inside the concurrency window is recorded and one outside is refused', async () => {
    const inside = await submittedApp(
      { classification: 'residential', dwellingUnits: 1, afterTheFact: false },
      '2024-09-01',
    )
    const ok = await recordCodeEdition(
      handle.db,
      world.staff,
      { applicationId: inside.applicationId, election: 'nh.edition.unverified_before_2024_07_01' },
      signal,
    )
    expect(ok.ok).toBe(true)
    const outside = await submittedApp(
      { classification: 'residential', dwellingUnits: 1, afterTheFact: false },
      '2025-02-01',
    )
    expect(
      await recordCodeEdition(
        handle.db,
        world.staff,
        {
          applicationId: outside.applicationId,
          election: 'nh.edition.unverified_before_2024_07_01',
        },
        signal,
      ),
    ).toEqual({ ok: false, error: 'election_not_allowed' })
  })

  it('record lists only review-board-confirmed amendments', async () => {
    const base = { codeSection: 'R311', adoptingAuthority: 'Select Board', adoptedOn: '2026-01-05' }
    await saveAndPublish(handle.db, world.admin, 'local_code_amendment', 'stairs', {
      ...base,
      title: 'Confirmed stair rule',
      reviewBoardConfirmedOn: '2026-02-01',
      stateText: 'Risers shall be 7 3/4 inches maximum.',
      townText: 'Risers shall be 7 1/2 inches maximum.',
    })
    await saveAndPublish(handle.db, world.admin, 'local_code_amendment', 'rails', {
      ...base,
      title: 'Pending rail rule',
      reviewBoardConfirmedOn: null,
    })
    const app = await submittedApp(
      { classification: 'residential', dwellingUnits: 1, afterTheFact: false },
      '2027-03-01',
    )
    await recordCodeEdition(handle.db, world.staff, { applicationId: app.applicationId }, signal)
    const [rec] = await handle.db
      .select()
      .from(codeEditionRecords)
      .where(eq(codeEditionRecords.applicationId, app.applicationId))
    expect(rec?.localAmendmentsInForce).toEqual([
      {
        key: 'stairs',
        title: 'Confirmed stair rule',
        codeSection: 'R311',
        stateText: 'Risers shall be 7 3/4 inches maximum.',
        townText: 'Risers shall be 7 1/2 inches maximum.',
      },
    ])
  })

  it('a reviewer is forbidden and a draft without a receipt date is not_submitted', async () => {
    const app = await submittedApp({
      classification: 'residential',
      dwellingUnits: 1,
      afterTheFact: false,
    })
    expect(
      await recordCodeEdition(
        handle.db,
        world.reviewer,
        { applicationId: app.applicationId },
        signal,
      ),
    ).toEqual({ ok: false, error: 'forbidden' })
    const draft = await makeApplication(handle.db, world)
    expect(
      await recordCodeEdition(
        handle.db,
        world.staff,
        { applicationId: draft.applicationId },
        signal,
      ),
    ).toEqual({ ok: false, error: 'not_submitted' })
  })

  it('recording again replaces the record', async () => {
    const app = await submittedApp({
      classification: 'residential',
      dwellingUnits: 1,
      afterTheFact: false,
    })
    await recordCodeEdition(handle.db, world.staff, { applicationId: app.applicationId }, signal)
    await recordCodeEdition(handle.db, world.staff, { applicationId: app.applicationId }, signal)
    expect(
      await handle.db
        .select()
        .from(codeEditionRecords)
        .where(eq(codeEditionRecords.applicationId, app.applicationId)),
    ).toHaveLength(1)
  })
})
