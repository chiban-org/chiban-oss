import { ME_PACK } from '@packs/me'
import { ME_2015_EDITION_KEY, ME_2021_EDITION_KEY } from '@packs/me/codeEditions'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Actor } from '@/features/auth/actor'
import { loadCaseDetail } from '@/features/enforcement/caseDetail'
import { openCase, setCaseStatus } from '@/features/enforcement/cases'
import { recordFinding } from '@/features/enforcement/findings'
import { setActivePackForTest } from '@/features/packs/registry'
import { saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { seedParcelWorld, staffActor } from '@/test/parcels'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const NOW = new Date('2027-03-02T15:00:00Z')
const d = (s: string) => s as CivilDate
let handle: TestDb
let staff: Actor
let admin: Actor

beforeEach(async () => {
  setActivePackForTest(ME_PACK)
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
  staff = await staffActor(handle.db, 'staff')
  admin = await staffActor(handle.db, 'admin')
})
afterEach(async () => {
  setActivePackForTest(null)
  await handle.drop()
})

async function publishProgram(codeChoice: string | null) {
  await saveAndPublish(handle.db, admin, 'building_program', 'default', {
    key: 'default',
    permitsEnabled: true,
    codeChoice,
    residents: null,
  })
}

async function caseWith(
  kind: 'building_code' | 'zoning_ordinance',
  inspectionDate: string,
): Promise<string> {
  const opened = await openCase(handle.db, staff, { locationText: '6 Alder Pond Road' }, signal)
  if (!opened.ok) throw new Error(opened.error)
  const { caseId } = opened.value
  await setCaseStatus(
    handle.db,
    staff,
    { caseId, to: 'investigating', expectedRowVersion: 1 },
    signal,
  )
  const found = await recordFinding(
    handle.db,
    staff,
    {
      caseId,
      provisionKind: kind,
      provisionRef: kind === 'building_code' ? 'IRC R105.1' : 'Zoning Ordinance Section 4.2',
      facts: 'A deck was built with no permit.',
      inspectionDate,
    },
    signal,
    NOW,
  )
  if (!found.ok) throw new Error(found.error)
  return caseId
}

async function editions(caseId: string) {
  const detail = await loadCaseDetail(handle.db, staff, caseId, d('2027-03-02'), signal)
  if (!detail.ok) throw new Error(detail.error)
  return detail.value.findings.map((f) => f.editionInForce ?? null)
}

describe('the code edition in force on a finding', () => {
  it('names the edition in force on the inspection date of a building code finding', async () => {
    await publishProgram('me.code.mubec')
    const caseId = await caseWith('building_code', '2027-02-26')
    const label = ME_PACK.manifest.codeEditions.find((e) => e.key === ME_2021_EDITION_KEY)?.label
    expect(label).toBeDefined()
    expect(await editions(caseId)).toEqual([label])
  })

  it('names the earlier edition for an inspection before the later edition took effect', async () => {
    await publishProgram('me.code.mubec')
    const caseId = await caseWith('building_code', '2024-06-01')
    const label = ME_PACK.manifest.codeEditions.find((e) => e.key === ME_2015_EDITION_KEY)?.label
    expect(label).toBeDefined()
    expect(await editions(caseId)).toEqual([label])
  })

  it('names no edition on a zoning finding', async () => {
    await publishProgram('me.code.mubec')
    const caseId = await caseWith('zoning_ordinance', '2027-02-26')
    expect(await editions(caseId)).toEqual([null])
  })
})
