import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applications } from '@/db/schema'
import { getStaffApplicationView } from '@/features/applications/staffApplicationView'
import { recordCodeEdition } from '@/features/building/codeEdition'
import { markComplete } from '@/features/building/completeness'
import { startClocksFor } from '@/features/clocks/startClocks'
import { createFeeOverride } from '@/features/fees/feeOverrides'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const NOW = new Date('2027-03-10T15:00:00Z')
let handle: TestDb
let world: PermitWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db)
})
afterEach(async () => {
  await handle.drop()
})

describe('getStaffApplicationView', () => {
  async function review() {
    const app = await makeApplication(handle.db, world, {
      state: 'submitted',
      receivedDate: '2027-03-01',
      values: { classification: 'residential', finished_sq_ft: '1000' },
      facts: { classification: 'residential', dwellingUnits: 1, afterTheFact: false },
    })
    await markComplete(
      handle.db,
      world.staff,
      { applicationId: app.applicationId, completedDate: '2027-03-01' as CivilDate },
      signal,
      NOW,
    )
    return app
  }

  it('returns null for an unknown application and refuses a viewer without record access', async () => {
    expect(
      await getStaffApplicationView(
        handle.db,
        world.staff,
        '00000000-0000-4000-8000-000000000000',
        NOW,
        signal,
      ),
    ).toBeNull()
    const app = await review()
    expect(
      await getStaffApplicationView(handle.db, world.reviewer, app.applicationId, NOW, signal),
    ).toBeNull()
  })

  it('lists clocks with explanations, the next transitions, and the gates of each', async () => {
    const app = await review()
    const view = await getStaffApplicationView(
      handle.db,
      world.staff,
      app.applicationId,
      NOW,
      signal,
    )
    expect(view?.number).toBe(app.number)
    expect(view?.clocks).toHaveLength(1)
    expect(view?.clocks[0]?.consequence.length).toBeGreaterThan(0)
    expect(view?.nextTransitions).toEqual(['under_review', 'denied', 'withdrawn'])
    expect(view?.gates.map((g) => g.to)).toEqual(['under_review', 'denied', 'withdrawn'])
  })

  it('shows the issuance gates once the application is decided', async () => {
    const app = await review()
    await handle.db
      .update(applications)
      .set({ state: 'decided' })
      .where(eq(applications.id, app.applicationId))
    const view = await getStaffApplicationView(
      handle.db,
      world.staff,
      app.applicationId,
      NOW,
      signal,
    )
    const issued = view?.gates.find((g) => g.to === 'issued')
    expect(issued?.results.map((r) => r.key).sort()).toEqual([
      'conditions.blocking_met',
      'fees.paid',
      'nh.bp.code_edition_recorded',
      'nh.bp.regional_impact',
    ])
  })

  it('previews the at-approval fee and shows a waiver against the computed amount', async () => {
    const app = await review()
    const before = await getStaffApplicationView(
      handle.db,
      world.staff,
      app.applicationId,
      NOW,
      signal,
    )
    expect(before?.fees.preview?.totalCents).toBe(35000)
    await createFeeOverride(
      handle.db,
      world.staff,
      {
        applicationId: app.applicationId,
        feeCode: 'building',
        kind: 'waive',
        reason: 'Town-owned building',
      },
      signal,
    )
    const after = await getStaffApplicationView(
      handle.db,
      world.staff,
      app.applicationId,
      NOW,
      signal,
    )
    expect(after?.fees.preview?.totalCents).toBe(0)
    expect(after?.fees.overrides).toHaveLength(1)
  })

  it('includes the code edition record, rows, and edition description once recorded', async () => {
    const app = await review()
    await recordCodeEdition(handle.db, world.staff, { applicationId: app.applicationId }, signal)
    const view = await getStaffApplicationView(
      handle.db,
      world.staff,
      app.applicationId,
      NOW,
      signal,
    )
    expect(view?.codeEdition?.record.editionKey).toBe('nh.edition.2024_07_01')
    expect(view?.codeEdition?.description.components).toContain('IBC 2021')
    expect(view?.codeEdition?.rows.find((r) => r.field === 'Application received')?.value).toBe(
      'March 1, 2027',
    )
  })

  it('includes the condition library and classification for the page controls', async () => {
    const app = await review()
    const view = await getStaffApplicationView(
      handle.db,
      world.staff,
      app.applicationId,
      NOW,
      signal,
    )
    expect(view?.conditionLibrary.map((c) => c.code)).toEqual(['SEPTIC'])
    expect(view?.classification).toBe('nh.building_permit')
  })

  it('reports which controls this viewer may use', async () => {
    const app = await review()
    const staffView = await getStaffApplicationView(
      handle.db,
      world.staff,
      app.applicationId,
      NOW,
      signal,
    )
    const adminView = await getStaffApplicationView(
      handle.db,
      world.admin,
      app.applicationId,
      NOW,
      signal,
    )
    expect(staffView?.permissions).toMatchObject({
      canIssue: true,
      canOverrideGate: true,
      canRecordStatutoryException: false,
    })
    expect(adminView?.permissions.canRecordStatutoryException).toBe(true)
  })

  it('applies to regional impact only for building permits and lists clocks started later', async () => {
    const app = await review()
    await handle.db.transaction((tx) =>
      startClocksFor(tx, app.applicationId, 'permit_issued', '2027-03-15' as CivilDate, signal),
    )
    const view = await getStaffApplicationView(
      handle.db,
      world.staff,
      app.applicationId,
      NOW,
      signal,
    )
    expect(view?.clocks.map((c) => c.ruleKey).sort()).toEqual([
      'nh.bp.decision',
      'town.bp.expiration',
    ])
    expect(view?.regionalImpact.applies).toBe(true)
  })
})
