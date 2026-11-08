import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  applicationConditions,
  applications,
  boardDecisions,
  codeEditionRecords,
  enforcementCases,
  projects,
  violationFindings,
} from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { openCase } from '@/features/enforcement/cases'
import { loadSectionListView } from '@/features/enforcement/sections/sectionListView'
import { loadFindingSuggestions } from '@/features/enforcement/sections/suggestionInputs'
import { addTownSection } from '@/features/enforcement/sections/townSections'
import { setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { decidedZba } from '@/test/hearingFixtures'
import { makeTestStore } from '@/test/objectStore'
import { makeParcel, seedParcelWorld, staffActor } from '@/test/parcels'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const BEFORE_2024_CODES = '2026-06-01' as CivilDate
const scope = (parcelId: string | null, today: CivilDate = BEFORE_2024_CODES) => ({
  parcelId,
  today,
})
let handle: TestDb
let admin: Actor
let staff: Actor

beforeEach(async () => {
  handle = await makeTestDb()
})
afterEach(async () => {
  await handle.drop()
})

async function basicWorld() {
  await seedParcelWorld(handle.db)
  admin = await staffActor(handle.db, 'admin')
  staff = await staffActor(handle.db, 'staff')
}

async function caseOn(parcelId: string | null): Promise<string> {
  const opened = await openCase(handle.db, staff, { locationText: '14 Birch Lane' }, signal)
  if (!opened.ok) throw new Error(opened.error)
  await handle.db
    .update(enforcementCases)
    .set({ parcelId })
    .where(eq(enforcementCases.id, opened.value.caseId))
  return opened.value.caseId
}

async function finding(caseId: string, kind: 'zoning_ordinance' | 'building_code', ref: string) {
  await handle.db.insert(violationFindings).values({
    caseId,
    provisionKind: kind,
    provisionRef: ref,
    facts: 'Seen on site.',
    inspectionDate: '2027-02-20',
    foundOn: '2027-02-20',
    foundBy: staff.userId,
  })
}

async function issuedPermit(
  parcelId: string,
  number: string,
  issuedOn: string,
  code: string,
): Promise<string> {
  const [project] = await handle.db
    .insert(projects)
    .values({ parcelId, title: 'Garage', createdBy: staff.userId })
    .returning({ id: projects.id })
  const [app] = await handle.db
    .insert(applications)
    .values({
      projectId: project?.id ?? '',
      number,
      applicationTypeKey: 'BP',
      configPins: {},
      state: 'issued',
      issuedOn,
      createdBy: staff.userId,
    })
    .returning({ id: applications.id })
  await handle.db.insert(applicationConditions).values({
    applicationId: app?.id ?? '',
    code,
    textSnapshot: 'Install the silt fence before work begins.',
    blocksIssuance: false,
    changedBy: staff.userId,
  })
  return app?.id ?? ''
}

describe('finding suggestions', () => {
  it('ranks past findings and merges them with the town list', async () => {
    await basicWorld()
    const caseId = await caseOn(null)
    await finding(caseId, 'zoning_ordinance', 'Zoning Ordinance Section 6.1')
    await finding(caseId, 'zoning_ordinance', 'zoning ordinance section 6.1 ')
    await finding(caseId, 'zoning_ordinance', 'Zoning Ordinance Section 7.3')
    await addTownSection(
      handle.db,
      admin,
      {
        provisionKind: 'zoning_ordinance',
        reference: 'Zoning Ordinance Section 4.2',
        title: 'accessory structure setbacks',
      },
      signal,
    )
    const zoning = (await loadFindingSuggestions(handle.db, scope(null), signal)).zoning_ordinance
    expect(zoning.map((s) => [s.value, s.sources])).toEqual([
      ['Zoning Ordinance Section 6.1', [{ kind: 'used', count: 2 }]],
      ['Zoning Ordinance Section 7.3', [{ kind: 'used', count: 1 }]],
      ['Zoning Ordinance Section 4.2, accessory structure setbacks', [{ kind: 'town' }]],
    ])
  })

  it('leaves withdrawn findings out of the counts', async () => {
    await basicWorld()
    const caseId = await caseOn(null)
    await finding(caseId, 'zoning_ordinance', 'Section 9.9')
    await handle.db.update(violationFindings).set({ status: 'withdrawn' })
    const zoning = (await loadFindingSuggestions(handle.db, scope(null), signal)).zoning_ordinance
    expect(zoning).toEqual([])
  })

  it('offers the state building code list for building code', async () => {
    await basicWorld()
    const building = (await loadFindingSuggestions(handle.db, scope(null), signal)).building_code
    expect(building[0]).toMatchObject({
      value: 'IRC 2021 Section R105.1, work without a required permit',
      sources: [{ kind: 'state_code' }],
    })
  })

  it('offers conditions on issued permits of the case parcel, newest first', async () => {
    await basicWorld()
    const parcelId = await makeParcel(handle.db, [])
    const elsewhere = await makeParcel(handle.db, [])
    await issuedPermit(parcelId, 'BP-2026-0001', '2026-03-01', '1')
    await issuedPermit(parcelId, 'BP-2026-0005', '2026-09-01', '2')
    await issuedPermit(elsewhere, 'BP-2026-0009', '2026-10-01', '3')
    const suggestions = await loadFindingSuggestions(handle.db, scope(parcelId), signal)
    expect(suggestions.permit_condition.map((s) => s.sources)).toEqual([
      [{ kind: 'condition', on: 'BP-2026-0005' }],
      [{ kind: 'condition', on: 'BP-2026-0001' }],
    ])
    expect(suggestions.permit_condition[0]?.value).toBe(
      'BP-2026-0005 condition 2: Install the silt fence before work begins.',
    )
    expect(suggestions.approved_plan).toHaveLength(2)
    expect(suggestions.zoning_ordinance).toEqual([])
  })

  it('offers the conditions of board decisions on the case parcel', async () => {
    const world = await setupBoardWorld(handle.db, { zbaMeetings: ['2027-04-15'] })
    staff = world.staff
    admin = world.admin
    const decided = await decidedZba(handle.db, world, (await makeTestStore()).store, {
      documents: false,
    })
    await handle.db
      .update(boardDecisions)
      .set({ conditions: [{ code: 'C1', text: 'Keep the fence under 6 feet.', precedent: false }] })
      .where(eq(boardDecisions.id, decided.decisionId))
    const [app] = await handle.db
      .select({ number: applications.number, parcelId: projects.parcelId })
      .from(applications)
      .innerJoin(projects, eq(projects.id, applications.projectId))
      .where(eq(applications.id, decided.applicationId))
    const suggestions = await loadFindingSuggestions(
      handle.db,
      scope(app?.parcelId ?? null),
      signal,
    )
    expect(suggestions.board_decision).toEqual([
      {
        value: `${app?.number ?? ''} decision condition C1: Keep the fence under 6 feet.`,
        title: '',
        sources: [{ kind: 'condition', on: `the ${app?.number ?? ''} decision` }],
      },
    ])
  })
})

describe('the state building code list by edition', () => {
  it('offers the 2024 codes for a finding recorded after they took effect', async () => {
    await basicWorld()
    const building = (
      await loadFindingSuggestions(handle.db, scope(null, '2026-11-08' as CivilDate), signal)
    ).building_code
    expect(building.map((s) => s.value.slice(0, 8))).toEqual(
      Array.from({ length: building.length }, () => 'IRC 2024'),
    )
  })

  it('adds the edition recorded on an issued permit of the case parcel', async () => {
    await basicWorld()
    const parcelId = await makeParcel(handle.db, [])
    const applicationId = await issuedPermit(parcelId, 'BP-2026-0002', '2026-05-01', '1')
    await handle.db.insert(codeEditionRecords).values({
      applicationId,
      receiptDate: '2026-04-01',
      editionKey: 'nh.edition.2024_07_01',
      editionLabel: 'IBC 2021',
      editionStatus: 'verified',
      localAmendmentsInForce: [],
      recordedBy: staff.userId,
    })
    const building = (
      await loadFindingSuggestions(handle.db, scope(parcelId, '2026-11-08' as CivilDate), signal)
    ).building_code
    const editions = [...new Set(building.map((s) => s.value.slice(0, 8)))]
    expect(editions).toEqual(['IRC 2024', 'IRC 2021', 'IBC 2021'])
  })
})

describe('typed in findings, not on the list', () => {
  it('lists past references the town and state lists do not cover', async () => {
    await basicWorld()
    const caseId = await caseOn(null)
    await finding(caseId, 'zoning_ordinance', 'Zoning Ordinance Section 4.2')
    await finding(caseId, 'zoning_ordinance', 'Sign ordinance Section 2')
    await finding(caseId, 'building_code', 'IRC 2021 Section R105.1')
    await addTownSection(
      handle.db,
      admin,
      { provisionKind: 'zoning_ordinance', reference: 'Zoning Ordinance Section 4.2', title: '' },
      signal,
    )
    const view = await loadSectionListView(handle.db, admin, signal)
    expect(view?.typedNotListed).toEqual([
      { kind: 'zoning_ordinance', ref: 'Sign ordinance Section 2', count: 1 },
    ])
    expect(view?.rows.map((r) => r.reference)).toEqual(['Zoning Ordinance Section 4.2'])
  })

  it('shows nothing to staff without config.edit', async () => {
    await basicWorld()
    expect(await loadSectionListView(handle.db, staff, signal)).toBeNull()
  })
})
