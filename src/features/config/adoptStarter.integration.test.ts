import { NH_STARTERS } from '@packs/nh/starters'
import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applications, clocks, configVersions, recordEvents } from '@/db/schema'
import { startClocksFor } from '@/features/clocks/startClocks'
import { adoptStarter } from '@/features/config/adoptStarter'
import { pinCurrent } from '@/features/config/bindings'
import { expireLapsedPermits } from '@/jobs/clocksDaily'
import { makeApplication, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { seedParcelWorld, staffActor } from '@/test/parcels'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
let handle: TestDb

beforeEach(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
})
afterEach(async () => {
  await handle.drop()
})

describe('adoptStarter', () => {
  it('adopting the building starter publishes one version per bundle member with upstream id and version', async () => {
    const admin = await staffActor(handle.db, 'admin')
    const r = await adoptStarter(handle.db, admin, 'nh.starter.building', signal)
    if (!r.ok) throw new Error(JSON.stringify(r.error))
    expect(r.value.versionIds).toHaveLength(10)
    const rows = await handle.db
      .select()
      .from(configVersions)
      .where(eq(configVersions.upstreamTemplateId, 'nh.starter.building'))
    expect(rows).toHaveLength(10)
    expect(rows.every((x) => x.status === 'published' && x.upstreamTemplateVersion === 2)).toBe(
      true,
    )
    expect(new Set(rows.map((x) => x.kind))).toEqual(
      new Set([
        'form',
        'fee_schedule',
        'condition_library',
        'inspection_checklist',
        'template',
        'application_type',
      ]),
    )
    expect((await pinCurrent(handle.db, 'BP', signal)).ok).toBe(true)
  })

  it('adopting twice is already_adopted', async () => {
    const admin = await staffActor(handle.db, 'admin')
    await adoptStarter(handle.db, admin, 'nh.starter.building', signal)
    expect(await adoptStarter(handle.db, admin, 'nh.starter.building', signal)).toEqual({
      ok: false,
      error: 'already_adopted',
    })
    const rows = await handle.db
      .select()
      .from(configVersions)
      .where(and(eq(configVersions.kind, 'application_type'), eq(configVersions.key, 'BP')))
    expect(rows).toHaveLength(1)
  })

  it('every starter passes publish checks', async () => {
    const admin = await staffActor(handle.db, 'admin')
    for (const s of NH_STARTERS) {
      const r = await adoptStarter(handle.db, admin, s.id, signal)
      if (!r.ok) throw new Error(`${s.id}: ${JSON.stringify(r.error)}`)
      expect((await pinCurrent(handle.db, s.applicationType.key, signal)).ok).toBe(true)
    }
  })

  it('staff without config.edit is forbidden and nothing is published', async () => {
    const staff = await staffActor(handle.db, 'staff')
    expect(await adoptStarter(handle.db, staff, 'nh.starter.building', signal)).toEqual({
      ok: false,
      error: 'forbidden',
    })
    expect(await handle.db.select().from(configVersions)).toHaveLength(0)
  })

  it('an unknown starter id is rejected', async () => {
    const admin = await staffActor(handle.db, 'admin')
    expect(await adoptStarter(handle.db, admin, 'nh.starter.nope', signal)).toEqual({
      ok: false,
      error: 'unknown_starter',
    })
  })

  it('adopting VAR publishes form, fee schedule, conditions, template, and application type with upstream ids', async () => {
    const admin = await staffActor(handle.db, 'admin')
    const r = await adoptStarter(handle.db, admin, 'nh.starter.zba_variance', signal)
    if (!r.ok) throw new Error(JSON.stringify(r.error))
    const rows = await handle.db
      .select()
      .from(configVersions)
      .where(eq(configVersions.upstreamTemplateId, 'nh.starter.zba_variance'))
    expect(rows.map((x) => x.kind).sort()).toEqual([
      'application_type',
      'condition_library',
      'fee_schedule',
      'form',
      'template',
      'template',
      'template',
      'template',
    ])
    expect(rows.every((x) => x.status === 'published')).toBe(true)
    expect((await pinCurrent(handle.db, 'VAR', signal)).ok).toBe(true)
  })

  it('every board starter passes publish checks', async () => {
    const admin = await staffActor(handle.db, 'admin')
    for (const starter of NH_STARTERS.filter((s) =>
      /^nh\.(pb|zba)_/.test(s.applicationType.classification ?? ''),
    )) {
      const r = await adoptStarter(handle.db, admin, starter.id, signal)
      if (!r.ok) throw new Error(`${starter.id}: ${JSON.stringify(r.error)}`)
    }
  })
})

describe('registration and temporary clocks', () => {
  async function issued(typeKey: string, starterId: string, issuedOn: string) {
    const world = await setupPermitWorld(handle.db, { starters: [starterId] })
    const app = await makeApplication(
      handle.db,
      world,
      { state: 'issued', issuedOn },
      new Date('2027-03-02T15:00:00Z'),
      typeKey,
    )
    await handle.db.transaction((tx) =>
      startClocksFor(tx, app.applicationId, 'permit_issued', issuedOn as CivilDate, signal),
    )
    return app
  }

  it('alarm registration issued 2027-05-01 expires 2028-05-01 and records registration_expired', async () => {
    const app = await issued('AR', 'nh.starter.alarm_registration', '2027-05-01')
    const [clock] = await handle.db
      .select()
      .from(clocks)
      .where(eq(clocks.applicationId, app.applicationId))
    expect(clock?.ruleKey).toBe('town.registration.expiration')
    expect(clock?.currentDue).toBe('2028-05-01')
    await handle.db.transaction((tx) => expireLapsedPermits(tx, '2028-05-02' as CivilDate, signal))
    const [row] = await handle.db
      .select()
      .from(applications)
      .where(eq(applications.id, app.applicationId))
    expect(row?.state).toBe('expired')
    const events = await handle.db
      .select()
      .from(recordEvents)
      .where(eq(recordEvents.applicationId, app.applicationId))
    expect(events.map((e) => [e.kind, e.occurredOn])).toEqual([
      ['registration_expired', '2028-05-02'],
    ])
  })

  it('temporary structure issued 2027-05-01 with the 180-day default lapses 2027-10-28', async () => {
    const app = await issued('TS', 'nh.starter.temporary_structure', '2027-05-01')
    const [clock] = await handle.db
      .select()
      .from(clocks)
      .where(eq(clocks.applicationId, app.applicationId))
    expect(clock?.ruleKey).toBe('town.temporary.expiration')
    expect(clock).toMatchObject({ lengthValue: 180, lengthUnit: 'days', currentDue: '2027-10-28' })
  })

  it('a driveway document defaults to the driveway series and a sign to the unscheduled series', async () => {
    const { defaultSeriesForApplication } = await import('@/features/documents/attach')
    const world = await setupPermitWorld(handle.db, {
      starters: ['nh.starter.driveway', 'nh.starter.sign'],
    })
    const dw = await makeApplication(handle.db, world, {}, undefined, 'DW')
    const sg = await makeApplication(handle.db, world, {}, undefined, 'SG')
    expect(
      await handle.db.transaction((tx) =>
        defaultSeriesForApplication(tx, dw.applicationId, signal),
      ),
    ).toBe('nh.rs.driveway_permits')
    expect(
      await handle.db.transaction((tx) =>
        defaultSeriesForApplication(tx, sg.applicationId, signal),
      ),
    ).toBe('nh.rs.unscheduled_permanent')
  })
})
