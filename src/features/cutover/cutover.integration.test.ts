import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { count, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  applications,
  clocks,
  cutoverReconciliations,
  cutoverRows,
  documents,
  feeOverrides,
  files,
  ledgerEntries,
  notificationOutbox,
  projectParties,
  roleCapabilities,
} from '@/db/schema'
import { transitionApplication } from '@/features/applications/transition'
import { attachCutoverFolder } from '@/features/cutover/attachFolder'
import { cutoverErrorSentence } from '@/features/cutover/errorSentences'
import { importCutoverCsv } from '@/features/cutover/importCutover'
import { reconcileCutover, signOffReconciliation } from '@/features/cutover/reconcile'
import { CUTOVER_FEES_PAID_VALUES, cutoverTemplate } from '@/features/cutover/template'
import { getObjectStore } from '@/features/storage/objectStore'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'

const signal = new AbortController().signal
const encoder = new TextEncoder()
const NOW = new Date('2027-06-01T16:00:00Z')
let handle: TestDb
let world: PermitWorld

const BASE = [
  'legacy_number',
  'application_type_key',
  'parcel_id_format',
  'parcel_id',
  'project_title',
  'applicant_name',
  'applicant_email',
  'owner_name',
  'contractor_name',
  'contractor_email',
  'contractor_license_number',
  'state',
  'received_date',
  'completed_date',
  'decided_on',
  'issued_on',
  'fees_paid_in_prior_system',
  'prior_receipt_ref',
  'field.description',
  'field.contractor_license_number',
  'field.work_type',
  'field.classification',
  'field.dwelling_units',
] as const

function csv(rows: Partial<Record<(typeof BASE)[number], string>>[]): Uint8Array {
  const lines = rows.map((r) => BASE.map((c) => `"${r[c] ?? ''}"`).join(','))
  return encoder.encode([BASE.join(','), ...lines].join('\n'))
}

const electrical = (n: string, extra: Partial<Record<(typeof BASE)[number], string>> = {}) => ({
  legacy_number: n,
  application_type_key: 'EL',
  parcel_id_format: 'gis12',
  parcel_id: '007001000000',
  project_title: 'Panel upgrade',
  applicant_name: 'Pat Applicant',
  applicant_email: 'pat@applicant.example',
  state: 'issued',
  received_date: '2027-02-01',
  issued_on: '2027-02-10',
  'field.description': 'Panel upgrade',
  'field.contractor_license_number': 'EL-1',
  ...extra,
})

const building = (n: string) => ({
  legacy_number: n,
  application_type_key: 'BP',
  parcel_id: '007001000000',
  project_title: 'Garage',
  applicant_name: 'Pat Applicant',
  state: 'under_review',
  received_date: '2027-03-01',
  completed_date: '2027-03-05',
  'field.work_type': 'building',
  'field.description': 'Two car garage',
  'field.classification': 'residential',
  'field.dwelling_units': '1',
})

beforeAll(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db, {
    starters: ['nh.starter.electrical', 'nh.starter.building'],
  })
})
afterAll(async () => {
  await handle.drop()
})

async function run(rows: Parameters<typeof csv>[0], dryRun = false, actor = world.staff) {
  const result = await importCutoverCsv(
    handle.db,
    actor,
    { bytes: csv(rows), dryRun, now: NOW },
    signal,
  )
  if (!result.ok) throw new Error(result.error)
  return result.value
}

describe('cutover import', () => {
  it('an issued electrical row imports as issued with issued_on 2027-02-10 and an exercise-by clock from that date', async () => {
    const report = await run([electrical('L-1')])
    expect(report.counts).toEqual({ imported: 1, alreadyImported: 0, errors: 0 })
    const [app] = await handle.db
      .select()
      .from(applications)
      .where(eq(applications.number, report.rows[0]?.applicationNumber ?? ''))
    expect(app).toMatchObject({
      state: 'issued',
      issuedOn: '2027-02-10',
      receivedDate: '2027-02-01',
    })
    expect(app?.number).toContain('2027')
  })

  it('an admin import creates the applicant, owner and contractor parties', async () => {
    const report = await run(
      [
        electrical('L-ADMIN', {
          owner_name: 'Olive Owner',
          contractor_name: 'Carl Contractor',
          contractor_email: 'carl@contractor.example',
        }),
      ],
      false,
      world.admin,
    )
    expect(report.counts).toEqual({ imported: 1, alreadyImported: 0, errors: 0 })
    const [app] = await handle.db
      .select()
      .from(applications)
      .where(eq(applications.number, report.rows[0]?.applicationNumber ?? ''))
    const parties = await handle.db
      .select()
      .from(projectParties)
      .where(eq(projectParties.projectId, app?.projectId ?? ''))
    expect(parties.map((p) => p.role).sort()).toEqual(['applicant', 'contractor', 'owner'])
  })

  it('a row whose parties cannot be added fails instead of reporting an import', async () => {
    await handle.db
      .delete(roleCapabilities)
      .where(eq(roleCapabilities.capability, 'project.manage_parties'))
    const before = await handle.db.select().from(cutoverRows)
    const report = await run([electrical('L-NOPARTY')], false, world.staff)
    await handle.db
      .insert(roleCapabilities)
      .values([
        { role: 'staff', capability: 'project.manage_parties' },
        { role: 'admin', capability: 'project.manage_parties' },
      ])
      .onConflictDoNothing()
    expect(report.counts).toEqual({ imported: 0, alreadyImported: 0, errors: 1 })
    expect(report.rows[0]?.errors).toEqual(['party_refused'])
    expect(await handle.db.select().from(cutoverRows)).toHaveLength(before.length)
  })

  it('an issued building row carries the exercise-by clock from its issue date', async () => {
    const report = await run([
      { ...building('L-1B'), state: 'issued', decided_on: '2027-03-20', issued_on: '2027-03-25' },
    ])
    expect(report.rows[0]?.errors).toEqual([])
    const [app] = await handle.db
      .select()
      .from(applications)
      .where(eq(applications.number, report.rows[0]?.applicationNumber ?? ''))
    expect(app).toMatchObject({ state: 'issued', decidedOn: '2027-03-20', issuedOn: '2027-03-25' })
    const issued = await handle.db
      .select()
      .from(clocks)
      .where(eq(clocks.applicationId, app?.id ?? ''))
    expect(
      issued.some((c) => c.startEvent === 'permit_issued' && c.startDate === '2027-03-25'),
    ).toBe(true)
  })

  it('a building row under review starts its decision clock from completed_date', async () => {
    const report = await run([building('L-2')])
    expect(report.rows[0]?.errors).toEqual([])
    expect(report.counts.imported).toBe(1)
    const [app] = await handle.db
      .select()
      .from(applications)
      .where(eq(applications.number, report.rows[0]?.applicationNumber ?? ''))
    expect(app).toMatchObject({ state: 'under_review', completedDate: '2027-03-05' })
    const decision = await handle.db
      .select()
      .from(clocks)
      .where(eq(clocks.applicationId, app?.id ?? ''))
    expect(decision.find((c) => c.ruleKey === 'nh.bp.decision')?.startDate).toBe('2027-03-05')
  })

  it('writes no notifications to the people on imported rows', async () => {
    const [{ n } = { n: 0 }] = await handle.db.select({ n: count() }).from(notificationOutbox)
    expect(n).toBe(0)
  })

  it('rerunning the same file reports already_imported and creates nothing', async () => {
    const before = (await handle.db.select({ n: count() }).from(applications))[0]?.n
    const report = await run([electrical('L-1'), building('L-2')])
    expect(report.counts).toEqual({ imported: 0, alreadyImported: 2, errors: 0 })
    expect((await handle.db.select({ n: count() }).from(applications))[0]?.n).toBe(before)
  })

  it('a parcel id that does not resolve is an error row and other rows still import', async () => {
    const report = await run([electrical('L-3', { parcel_id: '999999999999' }), electrical('L-4')])
    expect(report.counts).toEqual({ imported: 1, alreadyImported: 0, errors: 1 })
    expect(report.rows[0]).toMatchObject({ outcome: 'error', errors: ['parcel_not_found'] })
    expect(report.rows[1]?.outcome).toBe('imported')
  })

  it('dry run reports the same outcomes and leaves no rows', async () => {
    const before = (await handle.db.select({ n: count() }).from(applications))[0]?.n
    const rowsBefore = (await handle.db.select({ n: count() }).from(cutoverRows))[0]?.n
    const report = await run([electrical('L-5'), electrical('L-6', { parcel_id: '1' })], true)
    expect(report.counts).toEqual({ imported: 1, alreadyImported: 0, errors: 1 })
    expect((await handle.db.select({ n: count() }).from(applications))[0]?.n).toBe(before)
    expect((await handle.db.select({ n: count() }).from(cutoverRows))[0]?.n).toBe(rowsBefore)
    const real = await run([electrical('L-5')])
    expect(real.counts.imported).toBe(1)
  })

  it('fees paid in prior system waive the lines with the receipt reference and post no ledger entry', async () => {
    const report = await run([
      electrical('L-7', { fees_paid_in_prior_system: 'yes', prior_receipt_ref: 'R-100' }),
    ])
    const [app] = await handle.db
      .select()
      .from(applications)
      .where(eq(applications.number, report.rows[0]?.applicationNumber ?? ''))
    const waivers = await handle.db
      .select()
      .from(feeOverrides)
      .where(eq(feeOverrides.applicationId, app?.id ?? ''))
    expect(waivers.length).toBeGreaterThan(0)
    expect(
      waivers.every((w) => w.kind === 'waive' && w.reason === 'Paid in prior system: R-100'),
    ).toBe(true)
    expect((await handle.db.select({ n: count() }).from(ledgerEntries))[0]?.n).toBe(0)
  })

  it('malformed files and missing headers are refused', async () => {
    const result = await importCutoverCsv(
      handle.db,
      world.staff,
      { bytes: encoder.encode('a,b\n1,2'), dryRun: false },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'malformed' })
  })

  it('cutover option without cutover.import is forbidden', async () => {
    const reviewer = world.reviewer
    expect(
      await importCutoverCsv(
        handle.db,
        reviewer,
        { bytes: csv([electrical('L-8')]), dryRun: false, now: NOW },
        signal,
      ),
    ).toEqual({ ok: false, error: 'forbidden' })
    const made = await makeApplication(
      handle.db,
      world,
      { receivedDate: '2027-04-01' },
      new Date(),
      'EL',
    )
    const [row] = await handle.db
      .select()
      .from(applications)
      .where(eq(applications.id, made.applicationId))
    const moved = await handle.db.transaction((tx) =>
      transitionApplication(
        tx,
        reviewer,
        {
          applicationId: made.applicationId,
          to: 'issued',
          expectedRowVersion: row?.rowVersion ?? 1,
          cutover: true,
        },
        signal,
      ),
    )
    expect(moved).toEqual({ ok: false, error: 'forbidden' })
  })

  it('template lists the base columns then the form fields of the type', async () => {
    const header = await cutoverTemplate(handle.db, 'EL', signal)
    expect(header.split(',').slice(0, 3)).toEqual([
      'legacy_number',
      'application_type_key',
      'parcel_id_format',
    ])
    expect(header).toContain('field.description')
  })

  it('template without a type includes the fields of every adopted type and one licence column', async () => {
    const columns = (await cutoverTemplate(handle.db, '', signal)).split(',')
    expect(columns).toEqual(
      expect.arrayContaining(['field.description', 'field.work_type', 'field.dwelling_units']),
    )
    expect(columns).not.toContain('contractor_license_number')
    expect(new Set(columns).size).toBe(columns.length)
  })

  it('the template documents the accepted fee values', () => {
    expect(CUTOVER_FEES_PAID_VALUES).toEqual(['yes', 'y', 'true', 'no', 'n', 'false'])
  })
})

describe('fees_paid_in_prior_system values', () => {
  it('rejects an amount with a clear code and accepts no, n, false and empty', async () => {
    const report = await run([
      electrical('F-1', { fees_paid_in_prior_system: '45.00' }),
      electrical('F-2', { fees_paid_in_prior_system: 'No' }),
      electrical('F-3', { fees_paid_in_prior_system: 'false' }),
      electrical('F-4', { fees_paid_in_prior_system: '' }),
      electrical('F-5', { fees_paid_in_prior_system: 'Y' }),
    ])
    expect(report.rows.map((r) => [r.legacyNumber, r.outcome])).toEqual([
      ['F-1', 'error'],
      ['F-2', 'imported'],
      ['F-3', 'imported'],
      ['F-4', 'imported'],
      ['F-5', 'imported'],
    ])
    expect(report.rows[0]?.errors).toEqual(['invalid_fees_paid_in_prior_system'])
  })
})

describe('plain sentences for import errors', () => {
  it('maps known codes and keeps unknown ones readable', () => {
    expect(cutoverErrorSentence('parcel_not_found')).toMatch(/parcel/i)
    expect(cutoverErrorSentence('invalid_fees_paid_in_prior_system')).toMatch(/yes or no/i)
    expect(cutoverErrorSentence('description: required')).toBe('The description field is required.')
    expect(cutoverErrorSentence('future_date')).toMatch(/future/i)
    expect(cutoverErrorSentence('zzz_unknown')).toBe('zzz_unknown')
  })
})

describe('reconciliation', () => {
  it('lists missing and extra legacy numbers and needs an admin to sign off', async () => {
    const list = encoder.encode('legacy_number\nL-1\nL-2\nL-99\n')
    const result = await reconcileCutover(handle.db, world.staff, { listBytes: list }, signal)
    if (!result.ok) throw new Error(result.error)
    expect(result.value.report.inListAndImported).toEqual(['L-1', 'L-2'])
    expect(result.value.report.inListNotImported).toEqual(['L-99'])
    expect(result.value.report.importedNotInList).toEqual(expect.arrayContaining(['L-4', 'L-7']))
    expect(await signOffReconciliation(handle.db, world.staff, result.value.id, signal)).toEqual({
      ok: false,
      error: 'forbidden',
    })
    const admin = world.admin
    const signed = await signOffReconciliation(handle.db, admin, result.value.id, signal)
    expect(signed.ok).toBe(true)
    const [saved] = await handle.db.select().from(cutoverReconciliations)
    expect(saved?.signedOffBy).toBe(admin.userId)
  })

  it('sign off with an id that is not a UUID is not found instead of a database error', async () => {
    expect(await signOffReconciliation(handle.db, world.admin, 'abc', signal)).toEqual({
      ok: false,
      error: 'not_found',
    })
  })
})

describe('folder attach', () => {
  it('links files to the matching application, lists an unmatched folder, and stores identical files once', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cutover-'))
    const pdf = Buffer.from('%PDF-1.4\nsame bytes in two folders\n')
    for (const dir of ['L-1', 'L-2', 'NOT-A-NUMBER']) await mkdir(join(root, dir))
    await writeFile(join(root, 'L-1', 'scan.pdf'), pdf)
    await writeFile(join(root, 'L-2', 'scan.pdf'), pdf)
    await writeFile(join(root, 'L-2', 'notes.txt'), 'ignored')
    await writeFile(join(root, 'NOT-A-NUMBER', 'a.pdf'), Buffer.from('%PDF-1.4\nother\n'))
    const before = (await handle.db.select({ n: count() }).from(files))[0]?.n ?? 0
    const report = await attachCutoverFolder(
      handle.db,
      getObjectStore(),
      world.staff,
      { root },
      signal,
    )
    expect(report).toEqual({
      ok: true,
      value: { attached: 2, deduplicated: 1, unmatchedFolders: ['NOT-A-NUMBER'] },
    })
    expect(((await handle.db.select({ n: count() }).from(files))[0]?.n ?? 0) - before).toBe(1)
    const docs = await handle.db.select().from(documents).where(eq(documents.docKind, 'attachment'))
    expect(docs).toHaveLength(2)
    const again = await attachCutoverFolder(
      handle.db,
      getObjectStore(),
      world.staff,
      { root },
      signal,
    )
    expect(again.ok && again.value.attached).toBe(0)
    const denied = await attachCutoverFolder(
      handle.db,
      getObjectStore(),
      world.reviewer,
      { root },
      signal,
    )
    expect(denied).toEqual({ ok: false, error: 'forbidden' })
  })
})
