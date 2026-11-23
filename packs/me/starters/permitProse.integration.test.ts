import { ME_PACK } from '@packs/me'
import { ME_STARTERS } from '@packs/me/starters'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { projectParties } from '@/db/schema'
import { acceptWithoutDocument } from '@/features/applications/documentItems'
import type { Actor } from '@/features/auth/actor'
import { applyCondition } from '@/features/conditions/applicationConditions'
import { adoptStarter } from '@/features/config/adoptStarter'
import { issueApplication } from '@/features/issuance/issueApplication'
import { setActivePackForTest } from '@/features/packs/registry'
import { buildPermitPdf } from '@/features/permits/permitDocuments'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeTestStore } from '@/test/objectStore'
import { pdfWording } from '@/test/pdfWording'
import { staffWith } from '@/test/staffUsers'

const signal = new AbortController().signal
const NOW = new Date('2027-03-02T17:00:00Z')
const COUNTER_APPLICANT = 'Della Wexcombe'
let handle: TestDb
let world: PermitWorld
let plumber: Actor
let store: ObjectStore

beforeAll(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db)
  setActivePackForTest(ME_PACK)
  for (const starter of ME_STARTERS) {
    const adopted = await adoptStarter(handle.db, world.admin, starter.id, signal)
    expect(adopted.ok ? 'ok' : adopted.error, starter.id).toBe('ok')
  }
  await handle.db.insert(projectParties).values({
    projectId: world.projectId,
    name: COUNTER_APPLICANT,
    role: 'contractor',
    addedBy: world.staff.userId,
  })
  plumber = await staffWith(handle.db, ['plumbing_inspector'])
  store = (await makeTestStore()).store
})
beforeEach(() => {
  setActivePackForTest(ME_PACK)
})
afterAll(async () => {
  setActivePackForTest(null)
  await handle.drop()
})

async function permitText(
  prefix: string,
  by: () => Actor,
  conditionCodes: readonly string[] = [],
): Promise<string> {
  const made = await makeApplication(
    handle.db,
    world,
    { state: 'decided', receivedDate: '2027-02-01', decidedOn: '2027-03-01' },
    NOW,
    prefix,
  )
  const starter = ME_STARTERS.find((s) => s.applicationType.prefix === prefix)
  for (const item of (starter?.applicationType.documents ?? []).filter(
    (i) => i.stage === 'before_issue',
  )) {
    await acceptWithoutDocument(
      handle.db,
      world.staff,
      { applicationId: made.applicationId, itemKey: item.key, reason: 'Seen at the counter.' },
      signal,
    )
  }
  for (const code of conditionCodes) {
    const applied = await applyCondition(
      handle.db,
      by(),
      { applicationId: made.applicationId, code },
      signal,
    )
    expect(applied.ok ? 'ok' : applied.error).toBe('ok')
  }
  const issued = await issueApplication(
    handle.db,
    by(),
    { applicationId: made.applicationId },
    signal,
    { store, now: NOW },
  )
  expect(issued.ok ? 'ok' : JSON.stringify(issued.error)).toBe('ok')
  const pdf = await buildPermitPdf(handle.db, made.applicationId, signal)
  if (!pdf.ok) throw new Error(pdf.error)
  return (await pdfWording(pdf.value)).replace(/\s+/g, ' ')
}

describe('the Maine internal plumbing permit', () => {
  it('does not name the applicant recorded at the counter as the plumber', async () => {
    const text = await permitText('IP', () => plumber)
    expect(text).not.toContain(`Plumber ${COUNTER_APPLICANT}`)
    expect(text).not.toMatch(/Plumber Not recorded/)
  })
})

describe('a Maine permit with no conditions', () => {
  for (const [prefix, by] of [
    ['IP', () => plumber],
    ['SC', () => plumber],
    ['SLZ', () => world.staff],
  ] as const) {
    it(`a ${prefix} permit does not print "Conditions: Not recorded."`, async () => {
      const text = await permitText(prefix, by)
      expect(text).not.toContain('Conditions: Not recorded')
      expect(text).not.toMatch(/Conditions:/)
    })
  }

  it('a permit with a condition still prints it under the Conditions heading', async () => {
    const text = await permitText('SLZ', () => world.staff, ['EROSION'])
    expect(text).toContain(
      'Conditions Condition Erosion and sedimentation controls in place before soil is disturbed',
    )
  })
})
