import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { acceptWithoutDocument } from '@/features/applications/documentItems'
import { listCounterTypes } from '@/features/counter/directIssueTypes'
import { startCounterIntake } from '@/features/counter/intake/startIntake'
import { submitCounterIntake } from '@/features/counter/intake/submitIntake'
import { saveDraftValues } from '@/features/portal/drafts'
import { type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'

const signal = new AbortController().signal
const NOW = new Date('2027-06-01T16:00:00Z')
let handle: TestDb
let world: PermitWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db, {
    starters: ['nh.starter.temporary_use', 'nh.starter.energy_code'],
  })
})
afterEach(async () => {
  await handle.drop()
})

const SETUP = {
  description: 'Weekend tent sale',
  use_description: 'Tent sale of garden supplies',
  hours: '9am to 5pm',
  lot_location: 'Front corner of the lot',
  expected_attendance: 40,
  parking: 'Twenty spaces on the lot',
  sanitation: 'Two portable restrooms',
  is_owner: 'yes',
}

async function draftWith(dates: { start_date: string; end_date: string }): Promise<string> {
  const started = await startCounterIntake(
    handle.db,
    world.staff,
    {
      parcelId: world.parcelId,
      applicationTypeKey: 'TUP',
      applicant: { name: 'Morgan Reyes' },
      now: NOW,
    },
    signal,
  )
  if (!started.ok) throw new Error('start failed')
  const { applicationId } = started.value
  const saved = await saveDraftValues(
    handle.db,
    world.staff,
    { applicationId, values: { ...SETUP, ...dates } },
    signal,
  )
  if (!saved.ok) throw new Error(`save failed: ${JSON.stringify(saved.error)}`)
  const accepted = await acceptWithoutDocument(
    handle.db,
    world.staff,
    { applicationId, itemKey: 'tup_setup_sketch', reason: 'Sketch handed over at the counter.' },
    signal,
  )
  if (!accepted.ok) throw new Error('accept failed')
  return applicationId
}

describe('temporary use and energy code at the counter', () => {
  it('lists both to be taken for review', async () => {
    const types = await listCounterTypes(handle.db, signal)
    const keys = types.takeForReview.map((t) => t.key)
    expect(keys).toEqual(expect.arrayContaining(['TUP', 'EC']))
    expect(types.issueToday.map((t) => t.key)).not.toContain('TUP')
    expect(types.issueToday.map((t) => t.key)).not.toContain('EC')
  })

  it('refuses a four day use filed ten days ahead and explains both limits', async () => {
    const applicationId = await draftWith({ start_date: '2027-06-11', end_date: '2027-06-14' })
    const result = await submitCounterIntake(
      handle.db,
      world.staff,
      { applicationId, signedOnPaper: true, now: NOW },
      signal,
    )
    expect(result.ok).toBe(false)
    if (result.ok || typeof result.error !== 'object' || !('gateBlocked' in result.error)) {
      throw new Error('expected a blocked gate')
    }
    const gate = result.error.gateBlocked.find((g) => g.key === 'temporary_use.limits')
    const reason = gate?.outcome.status === 'blocked' ? gate.outcome.reason : ''
    expect(reason).toContain('at most 3 consecutive days in any 30-day period')
    expect(reason).toContain('File at least 14 days before the start date')
  })

  it('submits a three day use filed 14 days ahead', async () => {
    const applicationId = await draftWith({ start_date: '2027-06-15', end_date: '2027-06-17' })
    const result = await submitCounterIntake(
      handle.db,
      world.staff,
      { applicationId, signedOnPaper: true, now: NOW },
      signal,
    )
    expect(result).toEqual({ ok: true, value: { state: 'submitted' } })
  })
})
