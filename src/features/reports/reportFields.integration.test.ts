import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { permitVolumeReport } from '@/features/reports/permitVolume'
import { processingTimeReport } from '@/features/reports/processingTime'
import { loadReportFields } from '@/features/reports/reportFields'
import { permitVolumeCsv, processingTimeCsv } from '@/features/reports/reportSheets'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { appTypeBody, saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const MARCH = { from: '2027-03-01' as CivilDate, to: '2027-03-31' as CivilDate }
let handle: TestDb
let world: PermitWorld

beforeAll(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db, {
    starters: ['nh.starter.electrical'],
    buildingType: { reportFields: ['finished_sq_ft', 'not_on_the_form', 'classification'] },
  })
  await makeApplication(handle.db, world, {
    receivedDate: '2027-03-03',
    issuedOn: '2027-03-10',
    values: { finished_sq_ft: '1200.5' },
  })
  await makeApplication(handle.db, world, {
    receivedDate: '2027-03-04',
    issuedOn: '2027-03-12',
    values: { finished_sq_ft: 300 },
  })
  await makeApplication(handle.db, world, {
    receivedDate: '2027-03-05',
    values: {},
  })
  await makeApplication(handle.db, world, {
    receivedDate: '2027-02-05',
    issuedOn: '2027-03-20',
    values: { finished_sq_ft: 'not a number' },
  })
  await makeApplication(
    handle.db,
    world,
    { receivedDate: '2027-03-06', values: { finished_sq_ft: '999' } },
    new Date('2027-03-02T15:00:00Z'),
    'EL',
  )
})
afterAll(async () => {
  await handle.drop()
})

describe('reporting fields', () => {
  it('offers only the numeric questions on the current form as columns', async () => {
    const fields = await loadReportFields(handle.db, signal)
    expect(fields.columns).toEqual([
      { id: 'finished_sq_ft', key: 'finished_sq_ft', label: 'Finished sq ft', type: 'decimal' },
    ])
    expect(fields.byType.get('BP')).toEqual(['finished_sq_ft'])
    expect(fields.byType.has('EL')).toBe(false)
  })

  it('permit volume adds up the field over the applications received that month', async () => {
    const result = await permitVolumeReport(handle.db, world.staff, MARCH, signal)
    if (!result.ok) throw new Error(result.error)
    const building = result.value.find((r) => r.type === 'BP')
    expect(building).toMatchObject({ received: 3, fields: { finished_sq_ft: 1500.5 } })
  })

  it('leaves the column blank for a type that did not choose the field', async () => {
    const result = await permitVolumeReport(handle.db, world.staff, MARCH, signal)
    if (!result.ok) throw new Error(result.error)
    expect(result.value.find((r) => r.type === 'EL')?.fields).toEqual({})
  })

  it('processing time adds up the field over the permits issued, blank when none carry it', async () => {
    const result = await processingTimeReport(handle.db, world.staff, MARCH, signal)
    if (!result.ok) throw new Error(result.error)
    expect(result.value.find((r) => r.type === 'BP')).toMatchObject({
      issued: 3,
      fields: { finished_sq_ft: 1500.5 },
    })
    const onlyUnreadable = await processingTimeReport(
      handle.db,
      world.staff,
      { from: '2027-03-20' as CivilDate, to: '2027-03-20' as CivilDate },
      signal,
    )
    if (!onlyUnreadable.ok) throw new Error(onlyUnreadable.error)
    expect(onlyUnreadable.value.find((r) => r.type === 'BP')?.fields).toEqual({})
  })

  it('the exports carry the field as an extra column', async () => {
    const fields = await loadReportFields(handle.db, signal)
    const volume = await permitVolumeReport(handle.db, world.staff, MARCH, signal)
    const processing = await processingTimeReport(handle.db, world.staff, MARCH, signal)
    if (!volume.ok || !processing.ok) throw new Error('report failed')
    const volumeCsv = permitVolumeCsv(volume.value, fields.columns)
    expect(
      volumeCsv.startsWith('Month,Type,Received,Issued,Closed,Denied,Withdrawn,Finished sq ft\r\n'),
    ).toBe(true)
    expect(volumeCsv).toContain('2027-03,BP,3,3,0,0,0,1500.5\r\n')
    expect(volumeCsv).toContain('2027-03,EL,1,0,0,0,0,\r\n')
    expect(processingTimeCsv(processing.value, fields.columns)).toContain(',1500.5\r\n')
  })

  it('keeps a field from another form apart when it shares the key but not the label or kind', async () => {
    await saveAndPublish(handle.db, world.admin, 'form', 'alt-form', {
      key: 'alt-form',
      label: 'Alteration form',
      fields: [{ key: 'finished_sq_ft', label: 'Project value', type: 'money', required: false }],
    })
    await saveAndPublish(
      handle.db,
      world.admin,
      'application_type',
      'AL',
      appTypeBody({
        key: 'AL',
        label: 'Alteration permit',
        prefix: 'AL',
        formKey: 'alt-form',
        reportFields: ['finished_sq_ft'],
      }),
    )
    await makeApplication(
      handle.db,
      world,
      { receivedDate: '2027-03-07', values: { finished_sq_ft: '25000.50' } },
      new Date('2027-03-02T15:00:00Z'),
      'AL',
    )
    const fields = await loadReportFields(handle.db, signal)
    expect(fields.columns.map((c) => [c.label, c.type])).toEqual([
      ['Project value', 'money'],
      ['Finished sq ft', 'decimal'],
    ])
    const volume = await permitVolumeReport(handle.db, world.staff, MARCH, signal)
    if (!volume.ok) throw new Error(volume.error)
    const csv = permitVolumeCsv(volume.value, fields.columns)
    expect(csv).toContain(',Project value,Finished sq ft\r\n')
    expect(csv).toContain('2027-03,AL,1,0,0,0,0,25000.50,\r\n')
    expect(csv).toContain('2027-03,BP,3,3,0,0,0,,1500.5\r\n')
  })
})
