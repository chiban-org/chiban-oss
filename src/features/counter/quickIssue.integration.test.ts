import { eq, sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  applications,
  ledgerEntries,
  licenseChecks,
  parcels,
  projectParties,
  projects,
  roleCapabilities,
} from '@/db/schema'
import { adoptStarter } from '@/features/config/adoptStarter'
import { sendCounterClaim } from '@/features/contractors/counterClaim'
import { searchContractors } from '@/features/counter/contractorLookup'
import { completeQuickIssue, type QuickIssueInput, quickIssue } from '@/features/counter/quickIssue'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { resolveSimulatedReader } from '@/features/payments/startPayment'
import type { PermitWorld } from '@/test/applicationFixtures'
import { appTypeBody, saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { setupTradeWorld } from '@/test/ledgerFixtures'
import { setupPayments } from '@/test/paymentFixtures'

const signal = new AbortController().signal
const NOW = new Date('2027-03-02T17:00:00Z')
const deps = { now: NOW }
let handle: TestDb
let world: PermitWorld
let baseline: Awaited<ReturnType<typeof counts>>

beforeEach(async () => {
  handle = await makeTestDb()
  world = (await setupTradeWorld(handle.db)).world
  baseline = await counts()
})
afterEach(async () => {
  await handle.drop()
})

function input(overrides: Partial<QuickIssueInput> = {}): QuickIssueInput {
  return {
    parcelId: world.parcelId,
    applicationTypeKey: 'EL',
    values: { description: 'Panel upgrade', service_amps: 200 },
    contractor: { name: 'Pat Contractor', email: 'pat@contractor.example' },
    license: { number: 'EL-20418', type: 'Electrician', result: 'active' },
    payerName: 'Pat Contractor',
    payment: { method: 'cash', tenderedCents: 5000 },
    ...overrides,
  }
}

const counts = async () => ({
  projects: (await handle.db.select().from(projects)).length,
  applications: (await handle.db.select().from(applications)).length,
  entries: (await handle.db.select().from(ledgerEntries)).length,
})

describe('quickIssue claim link', () => {
  it('counter quick issue sends a claim to the contractor email', async () => {
    const mail = createMemoryTransport()
    const r = await quickIssue(handle.db, world.staff, input(), signal, deps)
    if (!r.ok) throw new Error('issue')
    const sent = await sendCounterClaim(
      handle.db,
      mail,
      world.staff,
      { applicationId: r.value.applicationId },
      signal,
    )
    expect(sent.ok).toBe(true)
    expect(mail.sent.map((m) => m.to)).toEqual(['pat@contractor.example'])
    expect(mail.sent[0]?.subject).toContain('Claim your project in Chiban')
  })

  it('a contractor without an email gets no claim', async () => {
    const mail = createMemoryTransport()
    const r = await quickIssue(
      handle.db,
      world.staff,
      input({
        contractor: { name: 'No Mail' },
        license: { number: 'EL-1', type: 'Electrician', result: 'active' },
      }),
      signal,
      deps,
    )
    if (!r.ok) throw new Error('issue')
    const sent = await sendCounterClaim(
      handle.db,
      mail,
      world.staff,
      { applicationId: r.value.applicationId },
      signal,
    )
    expect(sent).toEqual({ ok: false, error: 'no_party_email' })
    expect(mail.sent).toEqual([])
  })

  it('a reviewer cannot send it', async () => {
    const mail = createMemoryTransport()
    const r = await quickIssue(handle.db, world.staff, input(), signal, deps)
    if (!r.ok) throw new Error('issue')
    const sent = await sendCounterClaim(
      handle.db,
      mail,
      world.reviewer,
      { applicationId: r.value.applicationId },
      signal,
    )
    expect(sent).toEqual({ ok: false, error: 'forbidden' })
  })
})

describe('quickIssue cash and check', () => {
  it('titles the project with the permit type and the parcel, not a nested phrase', async () => {
    await handle.db
      .update(parcels)
      .set({ siteAddress: '12 Heron Cove Road' })
      .where(eq(parcels.id, world.parcelId))
    const r = await quickIssue(handle.db, world.staff, input(), signal, deps)
    expect(r.ok).toBe(true)
    const [project] = await handle.db.select().from(projects).orderBy(sql`created_at desc`).limit(1)
    expect(project?.title).toBe('Electrical permit, 12 Heron Cove Road')
  })

  it('falls back to the parcel id when the parcel has no address', async () => {
    const r = await quickIssue(handle.db, world.staff, input(), signal, deps)
    expect(r.ok).toBe(true)
    const [project] = await handle.db.select().from(projects).orderBy(sql`created_at desc`).limit(1)
    expect(project?.title).toBe('Electrical permit, 007001000000')
  })

  it('cash quick issue creates an issued EL permit with one 4500 entry, a license check row, and a contractor party with no user id', async () => {
    const r = await quickIssue(handle.db, world.staff, input(), signal, deps)
    expect(r.ok && r.value).toMatchObject({
      state: 'issued',
      number: 'EL-2027-0001',
      attemptId: null,
    })
    expect(r.ok && r.value.receiptNumber).toMatch(/^R-2027-/)
    const entries = await handle.db.select().from(ledgerEntries)
    expect(entries).toMatchObject([{ method: 'cash', amountCents: 4500 }])
    expect(await handle.db.select().from(licenseChecks)).toMatchObject([
      {
        licenseNumber: 'EL-20418',
        result: 'active',
        lookupUrl: 'https://forms.nh.gov/licenseverification/Search.aspx',
      },
    ])
    const parties = await handle.db
      .select()
      .from(projectParties)
      .where(eq(projectParties.role, 'contractor'))
    expect(parties).toMatchObject([
      { name: 'Pat Contractor', email: 'pat@contractor.example', userId: null },
    ])
    const [app] = await handle.db.select().from(applications)
    expect(app?.values).toMatchObject({ contractor_license_number: 'EL-20418' })
  })

  it('check quick issue records the check number', async () => {
    const r = await quickIssue(
      handle.db,
      world.staff,
      input({ payment: { method: 'check', checkNumber: '5521' } }),
      signal,
      deps,
    )
    expect(r.ok).toBe(true)
    expect(await handle.db.select().from(ledgerEntries)).toMatchObject([
      { method: 'check', checkNumber: '5521' },
    ])
  })

  it('license not found is license_not_active and creates nothing', async () => {
    const r = await quickIssue(
      handle.db,
      world.staff,
      input({ license: { number: 'EL-20418', type: 'Electrician', result: 'not_found' } }),
      signal,
      deps,
    )
    expect(r).toEqual({ ok: false, error: 'license_not_active' })
    expect(await counts()).toEqual(baseline)
  })

  it('a trade permit without a license check is license_required and creates nothing', async () => {
    const { license: _omitted, ...withoutLicense } = input()
    const r = await quickIssue(handle.db, world.staff, withoutLicense, signal, deps)
    expect(r).toEqual({ ok: false, error: 'license_required' })
    expect(await counts()).toEqual(baseline)
  })

  it('an alarm registration issues with no license and records no license check', async () => {
    const adopted = await adoptStarter(
      handle.db,
      world.admin,
      'nh.starter.alarm_registration',
      signal,
    )
    expect(adopted.ok).toBe(true)
    const { license: _omitted, ...withoutLicense } = input({
      applicationTypeKey: 'AR',
      values: { description: 'Burglar alarm', emergency_contact: 'Sam, 603 555 0100' },
    })
    const r = await quickIssue(handle.db, world.staff, withoutLicense, signal, deps)
    expect(r.ok && r.value).toMatchObject({ state: 'issued', number: 'AR-2027-0001' })
    expect(await handle.db.select().from(licenseChecks)).toHaveLength(0)
  })

  it('building permit type is not_direct_issue_type', async () => {
    await saveAndPublish(handle.db, world.admin, 'application_type', 'BP', appTypeBody())
    const r = await quickIssue(
      handle.db,
      world.staff,
      input({ applicationTypeKey: 'BP' }),
      signal,
      deps,
    )
    expect(r).toEqual({ ok: false, error: 'not_direct_issue_type' })
    expect(await counts()).toEqual(baseline)
  })

  it('a failing payment rolls back the project and application', async () => {
    const r = await quickIssue(
      handle.db,
      world.staff,
      input({ payment: { method: 'cash', tenderedCents: 4000 } }),
      signal,
      deps,
    )
    expect(r).toEqual({ ok: false, error: 'tendered_short' })
    expect(await counts()).toEqual(baseline)
    expect(await handle.db.select().from(licenseChecks)).toHaveLength(0)
  })

  it('a missing check number rolls back everything', async () => {
    const r = await quickIssue(
      handle.db,
      world.staff,
      input({ payment: { method: 'check', checkNumber: ' ' } }),
      signal,
      deps,
    )
    expect(r).toEqual({ ok: false, error: 'check_number_required' })
    expect(await counts()).toEqual(baseline)
  })

  it('invalid work details return field errors and create nothing', async () => {
    const r = await quickIssue(handle.db, world.staff, input({ values: {} }), signal, deps)
    expect(!r.ok && typeof r.error === 'object' && 'fieldErrors' in r.error).toBe(true)
    expect(await counts()).toEqual(baseline)
  })

  it('staff without payment.collect is forbidden', async () => {
    await handle.db
      .delete(roleCapabilities)
      .where(eq(roleCapabilities.capability, 'payment.collect'))
    const r = await quickIssue(handle.db, world.staff, input(), signal, deps)
    expect(r).toEqual({ ok: false, error: 'forbidden' })
    expect(await counts()).toEqual(baseline)
  })

  it('a reviewer is forbidden', async () => {
    expect(await quickIssue(handle.db, world.reviewer, input(), signal, deps)).toEqual({
      ok: false,
      error: 'forbidden',
    })
  })
})

describe('quickIssue card', () => {
  beforeEach(async () => {
    await setupPayments(handle.db, world.admin, 'simulated', 'sim_town')
  })

  async function startCard() {
    const r = await quickIssue(
      handle.db,
      world.staff,
      input({ payment: { method: 'card' } }),
      signal,
      deps,
    )
    if (!r.ok) throw new Error(JSON.stringify(r.error))
    expect(r.value).toMatchObject({ state: 'submitted', receiptNumber: null })
    return r.value
  }

  async function complete(applicationId: string) {
    const [row] = await handle.db
      .select()
      .from(applications)
      .where(eq(applications.id, applicationId))
    return await completeQuickIssue(
      handle.db,
      world.staff,
      { applicationId, expectedRowVersion: row?.rowVersion ?? 0 },
      signal,
      deps,
    )
  }

  it('card captured issues the permit', async () => {
    const started = await startCard()
    await resolveSimulatedReader(
      handle.db,
      world.staff,
      { attemptId: started.attemptId ?? '', outcome: 'captured' },
      signal,
      deps,
    )
    const done = await complete(started.applicationId)
    expect(done.ok && done.value.state).toBe('issued')
    expect(await handle.db.select().from(ledgerEntries)).toMatchObject([
      { method: 'card_present', amountCents: 4635 },
    ])
  })

  it('card declined leaves the application submitted with no entry', async () => {
    const started = await startCard()
    await resolveSimulatedReader(
      handle.db,
      world.staff,
      { attemptId: started.attemptId ?? '', outcome: 'declined' },
      signal,
      deps,
    )
    const done = await complete(started.applicationId)
    expect(!done.ok && typeof done.error === 'object' && 'gateBlocked' in done.error).toBe(true)
    const [app] = await handle.db.select().from(applications)
    expect(app?.state).toBe('submitted')
    expect(await handle.db.select().from(ledgerEntries)).toHaveLength(0)
  })

  async function decline(started: { attemptId: string | null }) {
    await resolveSimulatedReader(
      handle.db,
      world.staff,
      { attemptId: started.attemptId ?? '', outcome: 'declined' },
      signal,
      deps,
    )
  }

  it('after a decline staff retry with cash on the same application and number', async () => {
    const started = await startCard()
    await decline(started)
    const retry = await quickIssue(
      handle.db,
      world.staff,
      input({ applicationId: started.applicationId }),
      signal,
      deps,
    )
    expect(retry.ok && retry.value).toMatchObject({
      applicationId: started.applicationId,
      number: started.number,
      state: 'issued',
    })
    expect(await handle.db.select().from(applications)).toHaveLength(baseline.applications + 1)
    expect(await handle.db.select().from(projects)).toHaveLength(baseline.projects + 1)
    expect(await handle.db.select().from(ledgerEntries)).toMatchObject([
      { method: 'cash', amountCents: 4500 },
    ])
  })

  it('after a decline staff retry with the card on the same application', async () => {
    const started = await startCard()
    await decline(started)
    const retry = await quickIssue(
      handle.db,
      world.staff,
      input({ payment: { method: 'card' }, applicationId: started.applicationId }),
      signal,
      deps,
    )
    expect(retry.ok && retry.value).toMatchObject({
      applicationId: started.applicationId,
      number: started.number,
      state: 'submitted',
    })
    expect(retry.ok && retry.value.attemptId).not.toBe(started.attemptId)
    expect(retry.ok && retry.value.attemptId).not.toBeNull()
    expect(await handle.db.select().from(applications)).toHaveLength(baseline.applications + 1)
  })

  it('a retry for an application that is not a submitted one on that parcel is refused', async () => {
    const started = await startCard()
    await decline(started)
    await handle.db.update(applications).set({ state: 'withdrawn' })
    const retry = await quickIssue(
      handle.db,
      world.staff,
      input({ applicationId: started.applicationId }),
      signal,
      deps,
    )
    expect(retry).toEqual({ ok: false, error: 'not_found' })
  })

  it('unknown reader outcome leaves the permit unissued and no ledger entry', async () => {
    const started = await startCard()
    await resolveSimulatedReader(
      handle.db,
      world.staff,
      { attemptId: started.attemptId ?? '', outcome: 'unknown' },
      signal,
      deps,
    )
    const done = await complete(started.applicationId)
    const gate =
      !done.ok && typeof done.error === 'object' && 'gateBlocked' in done.error
        ? done.error.gateBlocked.find((g) => g.key === 'fees.paid')
        : undefined
    expect(gate?.outcome).toMatchObject({ status: 'unknown' })
    const [app] = await handle.db.select().from(applications)
    expect(app?.state).toBe('submitted')
    expect(await handle.db.select().from(ledgerEntries)).toHaveLength(0)
  })

  it('card without a configured processor is not_configured and creates nothing', async () => {
    await handle.db.execute(sql`update processor_accounts set is_active = false`)
    const r = await quickIssue(
      handle.db,
      world.staff,
      input({ payment: { method: 'card' } }),
      signal,
      deps,
    )
    expect(r).toEqual({ ok: false, error: 'not_configured' })
    expect(await counts()).toEqual(baseline)
  })
})

describe('searchContractors', () => {
  it('matches a prefix of the name and returns the last license number', async () => {
    await quickIssue(handle.db, world.staff, input(), signal, deps)
    const found = await searchContractors(handle.db, 'pat', signal)
    expect(found).toEqual([
      { name: 'Pat Contractor', email: 'pat@contractor.example', licenseNumber: 'EL-20418' },
    ])
    expect(await searchContractors(handle.db, 'zzz', signal)).toEqual([])
  })
})
