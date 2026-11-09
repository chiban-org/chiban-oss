import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applicationConditions, applications, auditLog, licenseChecks } from '@/db/schema'
import { loadApplicationContext } from '@/features/applications/context'
import { applyCondition } from '@/features/conditions/applicationConditions'
import { evaluateGates } from '@/features/gates/evaluateGates'
import { makeTestDb, type TestDb } from '@/test/db'
import { setupTradeWorld, submittedTrade, type TradeFixture } from '@/test/ledgerFixtures'
import type { CivilDate } from '@/types/civilDate'
import { LICENSE_GATE_KEY } from './licenseRules'
import { type RecordLicenseCheckInput, recordLicenseCheck } from './recordLicenseCheck'

const signal = new AbortController().signal
const NOW = new Date('2027-03-03T15:00:00Z')
const LATER = new Date('2027-03-04T15:00:00Z')
let handle: TestDb
let trade: TradeFixture

beforeEach(async () => {
  handle = await makeTestDb()
  const { world } = await setupTradeWorld(handle.db)
  trade = await submittedTrade(handle.db, world)
  await handle.db.delete(licenseChecks)
})
afterEach(async () => {
  await handle.drop()
})

function input(overrides: Partial<RecordLicenseCheckInput> = {}): RecordLicenseCheckInput {
  return {
    applicationId: trade.applicationId,
    licenseNumber: 'EL-1',
    licenseType: 'Master electrician',
    result: 'active',
    note: null,
    checkedAt: NOW,
    ...overrides,
  }
}

async function licenseGate() {
  return await handle.db.transaction(async (tx) => {
    const app = await loadApplicationContext(tx, trade.applicationId, signal)
    if (app === null) throw new Error('application missing')
    const gates = await evaluateGates(tx, app, 'issued', '2027-03-03' as CivilDate, signal)
    return gates.find((g) => g.key === LICENSE_GATE_KEY) ?? null
  })
}

async function applyLicenseCondition(): Promise<string> {
  const applied = await applyCondition(
    handle.db,
    trade.world.staff,
    { applicationId: trade.applicationId, code: 'LICENSE' },
    signal,
  )
  if (!applied.ok) throw new Error(`apply failed: ${applied.error}`)
  return applied.value.conditionId
}

describe('the state license gate on an online trade permit', () => {
  it('blocks issuance until a check is recorded', async () => {
    const gate = await licenseGate()
    expect(gate?.effective).toBe('blocked')
    expect(gate?.outcome).toEqual({
      status: 'blocked',
      reason: 'No state license check is recorded.',
    })
  })

  it('passes once an active result is recorded, and records who checked', async () => {
    const recorded = await recordLicenseCheck(handle.db, trade.world.staff, input(), signal)
    expect(recorded.ok).toBe(true)
    expect((await licenseGate())?.effective).toBe('pass')
    const [row] = await handle.db.select().from(licenseChecks)
    expect(row).toMatchObject({
      applicationId: trade.applicationId,
      licenseNumber: 'EL-1',
      result: 'active',
      checkedBy: trade.world.staff.userId,
      lookupUrl: 'https://forms.nh.gov/licenseverification/Search.aspx',
    })
    const audits = await handle.db
      .select({ action: auditLog.action })
      .from(auditLog)
      .where(eq(auditLog.action, 'license_check.record'))
    expect(audits).toHaveLength(1)
  })

  it('stays blocked with the reason when the latest check failed', async () => {
    await recordLicenseCheck(handle.db, trade.world.staff, input(), signal)
    await recordLicenseCheck(
      handle.db,
      trade.world.staff,
      input({ result: 'expired', note: 'Lapsed in June', checkedAt: LATER }),
      signal,
    )
    expect((await licenseGate())?.outcome).toEqual({
      status: 'blocked',
      reason: 'The latest state license check found license EL-1 expired. Lapsed in June.',
    })
  })

  it('marks an applied license condition met on an active result', async () => {
    const conditionId = await applyLicenseCondition()
    await recordLicenseCheck(handle.db, trade.world.staff, input(), signal)
    const [condition] = await handle.db
      .select()
      .from(applicationConditions)
      .where(eq(applicationConditions.id, conditionId))
    expect(condition?.status).toBe('met')
  })

  it('keeps an applied license condition unmet with the failing result as its reason', async () => {
    const conditionId = await applyLicenseCondition()
    await recordLicenseCheck(handle.db, trade.world.staff, input(), signal)
    await recordLicenseCheck(
      handle.db,
      trade.world.staff,
      input({ result: 'not_found', checkedAt: LATER }),
      signal,
    )
    const [condition] = await handle.db
      .select()
      .from(applicationConditions)
      .where(eq(applicationConditions.id, conditionId))
    expect(condition?.status).toBe('unmet')
    expect(condition?.statusReason).toBe(
      'The latest state license check found license EL-1 not found.',
    )
  })

  it('does not apply the license condition when it was not applied', async () => {
    await recordLicenseCheck(handle.db, trade.world.staff, input(), signal)
    expect(await handle.db.select().from(applicationConditions)).toHaveLength(0)
  })
})

describe('owner-performed trade work', () => {
  beforeEach(async () => {
    await handle.db
      .update(applications)
      .set({ values: { description: 'Panel upgrade', work_by: 'owner' } })
      .where(eq(applications.id, trade.applicationId))
  })

  it('has no license gate', async () => {
    expect(await licenseGate()).toBeNull()
  })

  it('refuses a license check', async () => {
    const recorded = await recordLicenseCheck(handle.db, trade.world.staff, input(), signal)
    expect(recorded).toEqual({ ok: false, error: 'not_applicable' })
    expect(await handle.db.select().from(licenseChecks)).toHaveLength(0)
  })
})

describe('who may record a license check', () => {
  it('refuses a reviewer, who cannot issue permits', async () => {
    const recorded = await recordLicenseCheck(handle.db, trade.world.reviewer, input(), signal)
    expect(recorded).toEqual({ ok: false, error: 'forbidden' })
    expect(await handle.db.select().from(licenseChecks)).toHaveLength(0)
  })

  it('refuses a closed application', async () => {
    await handle.db
      .update(applications)
      .set({ state: 'withdrawn' })
      .where(eq(applications.id, trade.applicationId))
    const recorded = await recordLicenseCheck(handle.db, trade.world.staff, input(), signal)
    expect(recorded).toEqual({ ok: false, error: 'application_closed' })
  })

  it('reports an unknown application as not found', async () => {
    const recorded = await recordLicenseCheck(
      handle.db,
      trade.world.staff,
      input({ applicationId: '00000000-0000-4000-8000-000000000000' }),
      signal,
    )
    expect(recorded).toEqual({ ok: false, error: 'not_found' })
  })
})

describe('a license check is for the license on the application', () => {
  it('refuses a check of a different license number than the application names', async () => {
    const recorded = await recordLicenseCheck(
      handle.db,
      trade.world.staff,
      input({ licenseNumber: 'EL-999' }),
      signal,
    )
    expect(recorded).toEqual({ ok: false, error: 'license_mismatch' })
    expect(await handle.db.select().from(licenseChecks)).toHaveLength(0)
  })

  it('matches the number regardless of case and spaces', async () => {
    const recorded = await recordLicenseCheck(
      handle.db,
      trade.world.staff,
      input({ licenseNumber: ' el-1 ' }),
      signal,
    )
    expect(recorded.ok).toBe(true)
    expect((await licenseGate())?.effective).toBe('pass')
  })

  it('blocks again when the application is amended to another license after the check', async () => {
    await recordLicenseCheck(handle.db, trade.world.staff, input(), signal)
    await handle.db
      .update(applications)
      .set({ values: { description: 'Panel upgrade', contractor_license_number: 'EL-2' } })
      .where(eq(applications.id, trade.applicationId))
    expect((await licenseGate())?.outcome).toEqual({
      status: 'blocked',
      reason:
        'The latest state license check was for license EL-1, but the application now names EL-2.',
    })
  })
})
