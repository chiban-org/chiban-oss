import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parcels } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { censusBpsReport, censusCsv } from '@/features/census/bpsReport'
import { type CensusInput, classifyForCensus } from '@/features/census/classify'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { appTypeBody, saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'

const signal = new AbortController().signal
let handle: TestDb
let world: PermitWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db)
  await handle.db
    .update(parcels)
    .set({ siteAddress: '14 Birch Lane', ownerName: 'Alder Holdings LLC' })
    .where(eq(parcels.id, world.parcelId))
})
afterEach(async () => {
  await handle.drop()
})

const HOUSE = {
  work_type: 'building',
  description: 'New single-family house',
  classification: 'residential',
  dwelling_units: 1,
  estimated_cost: '350000.00',
}

async function issued(
  issuedOn: string,
  values: Record<string, unknown> = HOUSE,
  typeKey = 'BP',
): Promise<{ applicationId: string; number: string }> {
  return await makeApplication(
    handle.db,
    world,
    { state: 'issued', issuedOn, values },
    new Date('2027-01-05T15:00:00Z'),
    typeKey,
  )
}

const SINGLE: CensusInput = {
  category: 'single_family',
  excludedReason: null,
  phase: 'whole_building',
  buildings: 1,
  housingUnits: 1,
  valuationDollars: 350000,
}
const FOUR_UNIT: CensusInput = {
  category: 'three_four_unit',
  excludedReason: null,
  phase: 'whole_building',
  buildings: 1,
  housingUnits: 4,
  valuationDollars: 1200000,
}
const ADDITION: CensusInput = {
  category: 'excluded',
  excludedReason: 'addition_or_alteration',
  phase: 'whole_building',
  buildings: 0,
  housingUnits: 0,
  valuationDollars: 0,
}

async function classify(applicationId: string, input: CensusInput, actor: Actor = world.staff) {
  return await classifyForCensus(handle.db, actor, { applicationId, ...input }, signal)
}

const march = () => censusBpsReport(handle.db, world.staff, { year: 2027, month: 3 }, signal)

async function marchReport() {
  const r = await march()
  if (!r.ok) throw new Error(`report ${r.error}`)
  return r.value
}

describe('census building permits report', () => {
  it('march 2027 report counts a single-family house and a four-unit building', async () => {
    const house = await issued('2027-03-10')
    const quad = await issued('2027-03-22', {
      ...HOUSE,
      dwelling_units: 4,
      estimated_cost: '1200000',
    })
    expect((await classify(house.applicationId, SINGLE)).ok).toBe(true)
    expect((await classify(quad.applicationId, FOUR_UNIT)).ok).toBe(true)
    const report = await marchReport()
    expect(report.period).toBe('March 2027')
    expect(report.townName).toBe('Town of Alder Pond')
    expect(report.items.map((i) => i.code)).toEqual(['101', '103', '104', '105'])
    expect(report.items[0]).toMatchObject({
      buildings: 1,
      housingUnits: 1,
      valuationDollars: 350000,
    })
    expect(report.items[1]).toMatchObject({ buildings: 0, housingUnits: 0, valuationDollars: 0 })
    expect(report.items[2]).toMatchObject({
      buildings: 1,
      housingUnits: 4,
      valuationDollars: 1200000,
    })
    expect(report.complete).toBe(true)
    expect(report.noPermits).toBe(false)
  })

  it('the four-unit building also appears in section 4', async () => {
    const house = await issued('2027-03-10')
    const quad = await issued('2027-03-22', {
      ...HOUSE,
      dwelling_units: 4,
      estimated_cost: '1200000',
    })
    await classify(house.applicationId, SINGLE)
    await classify(quad.applicationId, FOUR_UNIT)
    const report = await marchReport()
    expect(report.largePermits).toEqual([
      {
        number: quad.number,
        description: 'New single-family house',
        siteAddress: '14 Birch Lane',
        ownerOrBuilder: 'Alder Holdings LLC',
        buildings: 1,
        housingUnits: 4,
        valuationDollars: 1200000,
      },
    ])
  })

  it('a permit of exactly one million dollars is in section 4 and 999999 is not', async () => {
    const a = await issued('2027-03-10')
    const b = await issued('2027-03-11')
    await classify(a.applicationId, { ...SINGLE, valuationDollars: 1000000 })
    await classify(b.applicationId, { ...SINGLE, valuationDollars: 999999 })
    expect((await marchReport()).largePermits.map((p) => p.number)).toEqual([a.number])
  })

  it('a permit issued 2027-04-01 is not in march and the last day of march is', async () => {
    const last = await issued('2027-03-31')
    const april = await issued('2027-04-01')
    await classify(last.applicationId, SINGLE)
    await classify(april.applicationId, SINGLE)
    const report = await marchReport()
    expect(report.items[0]?.buildings).toBe(1)
    const annual = await censusBpsReport(
      handle.db,
      world.staff,
      { year: 2027, month: null },
      signal,
    )
    expect(annual.ok && annual.value.period).toBe('2027')
    expect(annual.ok && annual.value.items[0]?.buildings).toBe(2)
  })

  it('an unclassified issued building permit makes the report incomplete', async () => {
    const house = await issued('2027-03-10')
    const report = await marchReport()
    expect(report.complete).toBe(false)
    expect(report.needsClassification).toEqual([
      { applicationId: house.applicationId, number: house.number },
    ])
    expect(report.items[0]?.buildings).toBe(0)
    expect(report.noPermits).toBe(false)
  })

  it('excluded addition and electrical permits are not counted', async () => {
    const addition = await issued('2027-03-12', { ...HOUSE, description: 'Kitchen addition' })
    await classify(addition.applicationId, ADDITION)
    await saveAndPublish(
      handle.db,
      world.admin,
      'application_type',
      'EL',
      appTypeBody({ key: 'EL', prefix: 'EL', classification: 'nh.trade_permit' }),
    )
    await issued('2027-03-13', { description: 'Replace the main panel' }, 'EL')
    const report = await marchReport()
    expect(report.items.every((i) => i.buildings === 0 && i.valuationDollars === 0)).toBe(true)
    expect(report.complete).toBe(true)
    expect(report.needsClassification).toEqual([])
    expect(report.largePermits).toEqual([])
  })

  it('a unit of an already reported multifamily building is not counted twice', async () => {
    const first = await issued('2027-03-10', {
      ...HOUSE,
      dwelling_units: 4,
      estimated_cost: '1200000',
    })
    const second = await issued('2027-03-15', { ...HOUSE, dwelling_units: 1 })
    await classify(first.applicationId, FOUR_UNIT)
    await classify(second.applicationId, {
      ...ADDITION,
      excludedReason: 'unit_of_reported_multifamily',
    })
    const report = await marchReport()
    expect(report.items[2]).toMatchObject({ buildings: 1, housingUnits: 4 })
    expect(report.items.reduce((sum, i) => sum + i.buildings, 0)).toBe(1)
  })

  it('a foundation-only phase adds valuation without buildings or units', async () => {
    const house = await issued('2027-03-10')
    await classify(house.applicationId, {
      ...SINGLE,
      phase: 'foundation_or_finish_only',
      buildings: 0,
      housingUnits: 0,
      valuationDollars: 60000,
    })
    expect((await marchReport()).items[0]).toMatchObject({
      buildings: 0,
      housingUnits: 0,
      valuationDollars: 60000,
    })
  })

  it('empty month reports noPermits', async () => {
    const report = await marchReport()
    expect(report.noPermits).toBe(true)
    expect(report.complete).toBe(true)
    expect(report.items.every((i) => i.buildings === 0)).toBe(true)
  })

  it('a draft or submitted application is not a permit issued in the month', async () => {
    await makeApplication(handle.db, world, { state: 'submitted' })
    expect((await marchReport()).noPermits).toBe(true)
  })

  it('csv rows end with CRLF', async () => {
    const house = await issued('2027-03-10')
    const quad = await issued('2027-03-22', {
      ...HOUSE,
      description: 'Four-unit building, "Birch Court"',
      dwelling_units: 4,
      estimated_cost: '1200000',
    })
    await classify(house.applicationId, SINGLE)
    await classify(quad.applicationId, FOUR_UNIT)
    const csv = censusCsv(await marchReport())
    const lines = csv.split('\r\n')
    expect(lines.at(-1)).toBe('')
    expect(csv.replaceAll('\r\n', '')).not.toMatch(/[\r\n]/)
    expect(lines[0]).toBe('Item,Type of structure,Buildings,Housing units,Valuation')
    expect(lines[1]).toBe('101,"Single-family houses, detached and attached",1,1,350000')
    expect(lines[4]).toBe('105,Buildings with five or more units,0,0,0')
    expect(lines[5]).toBe('')
    expect(lines[6]).toBe(
      'Number,Description,Site address,Owner or builder,Buildings,Housing units,Valuation',
    )
    expect(lines[7]).toContain('"Four-unit building, ""Birch Court"""')
    expect(lines[7]).toContain(',1,4,1200000')
  })

  it('staff without report.view is forbidden', async () => {
    expect(
      await censusBpsReport(handle.db, world.reviewer, { year: 2027, month: 3 }, signal),
    ).toEqual({
      ok: false,
      error: 'forbidden',
    })
    expect(
      (await classify((await issued('2027-03-10')).applicationId, SINGLE, world.reviewer)).ok,
    ).toBe(false)
  })

  it('classification refuses a trade permit and a missing application', async () => {
    await saveAndPublish(
      handle.db,
      world.admin,
      'application_type',
      'EL',
      appTypeBody({ key: 'EL', prefix: 'EL', classification: 'nh.trade_permit' }),
    )
    const trade = await issued('2027-03-13', { description: 'Panel' }, 'EL')
    expect(await classify(trade.applicationId, SINGLE)).toEqual({
      ok: false,
      error: 'not_a_building_permit',
    })
    expect(await classify('00000000-0000-4000-8000-000000000000', SINGLE)).toEqual({
      ok: false,
      error: 'not_found',
    })
  })

  it('reclassifying replaces the earlier answer', async () => {
    const house = await issued('2027-03-10')
    await classify(house.applicationId, SINGLE)
    await classify(house.applicationId, { ...SINGLE, valuationDollars: 400000 })
    expect((await marchReport()).items[0]?.valuationDollars).toBe(400000)
  })
})
