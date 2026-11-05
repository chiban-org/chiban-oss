import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { clocks, documents, enforcementCases, historicalRecords } from '@/db/schema'
import { summarizeApplications } from '@/features/applications/recordSource'
import { summarizeDocuments } from '@/features/documents/recordSource'
import { summarizeCases } from '@/features/enforcement/recordSource'
import { summarizeHistoricalRecords } from '@/features/historical/recordSource'
import { summarizeInspections } from '@/features/inspections/recordSource'
import { makeApplication, type PermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { insertInspection, setupInspectionWorld } from '@/test/inspectionFixtures'

const signal = new AbortController().signal
let handle: TestDb
let world: PermitWorld

beforeAll(async () => {
  handle = await makeTestDb()
  world = (await setupInspectionWorld(handle.db)).world
})
afterAll(async () => {
  await handle.drop()
})

const staff = () => ({ kind: 'actor' as const, actor: world.staff })

async function addClock(
  applicationId: string,
  ruleKey: string,
  due: string,
  extra: { supersededBy?: string; createdAt?: Date } = {},
): Promise<string> {
  const [row] = await handle.db
    .insert(clocks)
    .values({
      applicationId,
      ruleKey,
      ruleVersion: 1,
      packVersion: '0.3.0',
      startEvent: 'permit_issued',
      startDate: '2027-01-10',
      lengthValue: 12,
      lengthUnit: 'months',
      countingMethod: 'test',
      computedDue: due,
      currentDue: due,
      source: 'pack_rule',
      ...(extra.supersededBy === undefined ? {} : { supersededBy: extra.supersededBy }),
      ...(extra.createdAt === undefined ? {} : { createdAt: extra.createdAt }),
    })
    .returning({ id: clocks.id })
  return row?.id ?? ''
}

describe('parcel record dates', () => {
  it('gives an application its received, issued and decided dates and its type', async () => {
    const app = await makeApplication(handle.db, world, {
      state: 'issued',
      receivedDate: '2027-01-04',
      decidedOn: '2027-01-08',
      issuedOn: '2027-01-10',
    })
    const [s] = await summarizeApplications(handle.db, [app.applicationId], staff(), signal)
    expect(s?.dates).toEqual({
      filed: '2027-01-04',
      issued: '2027-01-10',
      expires: null,
      closed: '2027-01-08',
    })
    expect(s?.type?.key).toBe('BP')
    expect(s?.type?.label).toBe(s?.title)
  })

  it('takes the expiry from the newest current lapse clock', async () => {
    const app = await makeApplication(handle.db, world, { state: 'issued', issuedOn: '2027-01-10' })
    await addClock(app.applicationId, 'town.bp.expiration', '2027-12-01', {
      createdAt: new Date('2027-01-10T12:00:00Z'),
    })
    await addClock(app.applicationId, 'town.bp.expiration', '2028-06-01', {
      createdAt: new Date('2027-11-20T12:00:00Z'),
    })
    await addClock(app.applicationId, 'nh.bp.decision', '2029-02-01', {
      createdAt: new Date('2027-12-20T12:00:00Z'),
    })
    const [s] = await summarizeApplications(handle.db, [app.applicationId], staff(), signal)
    expect(s?.dates?.expires).toBe('2028-06-01')
  })

  it('ignores a superseded lapse clock', async () => {
    const app = await makeApplication(handle.db, world, { state: 'issued', issuedOn: '2027-01-10' })
    const current = await addClock(app.applicationId, 'town.bp.expiration', '2027-12-01', {
      createdAt: new Date('2027-01-10T12:00:00Z'),
    })
    await addClock(app.applicationId, 'town.bp.expiration', '2028-06-01', {
      createdAt: new Date('2027-11-20T12:00:00Z'),
      supersededBy: current,
    })
    const [s] = await summarizeApplications(handle.db, [app.applicationId], staff(), signal)
    expect(s?.dates?.expires).toBe('2027-12-01')
  })

  it('reads each lapse rule in the pack as an expiry', async () => {
    const keys = ['town.registration.expiration', 'town.temporary.expiration', 'nh.zba.exercise']
    for (const key of keys) {
      const app = await makeApplication(handle.db, world, { state: 'issued' })
      await addClock(app.applicationId, key, '2029-03-03')
      const [s] = await summarizeApplications(handle.db, [app.applicationId], staff(), signal)
      expect(s?.dates?.expires).toBe('2029-03-03')
    }
  })

  it('gives a case its opened and closed dates', async () => {
    const [row] = await handle.db
      .insert(enforcementCases)
      .values({
        number: 'EC-2027-0091',
        locationText: '1 Main St',
        status: 'closed',
        openedOn: '2027-02-02',
        closedOn: '2027-04-04',
      })
      .returning({ id: enforcementCases.id })
    const [s] = await summarizeCases(handle.db, [row?.id ?? ''], staff(), signal)
    expect(s?.dates).toEqual({
      filed: '2027-02-02',
      issued: null,
      expires: null,
      closed: '2027-04-04',
    })
    expect(s?.type).toEqual({ key: 'enforcement_case', label: 'Code enforcement case' })
  })

  it('gives an inspection its requested and result dates', async () => {
    const app = await makeApplication(handle.db, world, { state: 'issued' }, undefined, 'EL')
    const id = await insertInspection(handle.db, app.applicationId, 'rough', {
      requestedAt: new Date('2027-05-03T15:00:00Z'),
      scheduledDate: '2027-05-06',
      status: 'passed',
      resultRecordedAt: new Date('2027-05-06T18:00:00Z'),
    })
    const [s] = await summarizeInspections(handle.db, [id], staff(), signal)
    expect(s?.dates).toEqual({
      filed: '2027-05-03',
      issued: null,
      expires: null,
      closed: '2027-05-06',
    })
    expect(s?.type).toEqual({ key: 'inspection', label: 'Inspection' })
  })

  it('gives a document its owner and the date it was added', async () => {
    const app = await makeApplication(handle.db, world)
    const [doc] = await handle.db
      .insert(documents)
      .values({
        recordKind: 'application',
        recordId: app.applicationId,
        title: 'Site plan',
        docKind: 'attachment',
        createdByKind: 'system',
        createdAt: new Date('2027-03-05T15:00:00Z'),
      })
      .returning({ id: documents.id })
    const [s] = await summarizeDocuments(handle.db, [doc?.id ?? ''], staff(), signal)
    expect(s?.owner).toEqual({ kind: 'application', id: app.applicationId })
    expect(s?.dates?.filed).toBe('2027-03-05')
  })

  it('gives a historical record its recorded date', async () => {
    const [row] = await handle.db
      .insert(historicalRecords)
      .values({
        recordType: 'Building permit',
        number: 'B-1988-12',
        recordedOn: '1988-06-01',
        values: {},
        sourceFile: 'ledger.xlsx',
        sourceSha256: 'abc',
        sourceSheet: 'Permits',
        sourceRow: 2,
        importedBy: world.admin.userId,
      })
      .returning({ id: historicalRecords.id })
    const [s] = await summarizeHistoricalRecords(handle.db, [row?.id ?? ''], staff(), signal)
    expect(s?.dates).toEqual({ filed: '1988-06-01', issued: null, expires: null, closed: null })
    expect(s?.type).toEqual({ key: 'historical_record', label: 'Historical record' })
  })
})
