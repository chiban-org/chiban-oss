import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { roleCapabilities } from '@/db/schema'
import { loadActor } from '@/features/auth/actor'
import { listSchedules } from '@/features/reports/scheduleQueries'
import {
  createSchedule,
  deleteSchedule,
  setSchedulePaused,
  updateSchedule,
} from '@/features/reports/schedules'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeUser } from '@/test/factories'
import { seedParcelWorld, staffActor } from '@/test/parcels'

const signal = new AbortController().signal
const NOV_8 = new Date('2026-11-08T15:00:00Z')
let handle: TestDb
let staff: Awaited<ReturnType<typeof staffActor>>
let admin: Awaited<ReturnType<typeof staffActor>>
let inspector: Awaited<ReturnType<typeof staffActor>>
let viewerOnly: Awaited<ReturnType<typeof staffActor>>

beforeAll(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
  staff = await staffActor(handle.db, 'staff')
  admin = await staffActor(handle.db, 'admin')
  inspector = await staffActor(handle.db, 'inspector')
  await handle.db
    .insert(roleCapabilities)
    .values({ role: 'report_viewer', capability: 'report.view' })
  const viewerId = await makeUser(handle.db, { roles: ['report_viewer'] as never })
  const loaded = await loadActor(handle.db, viewerId, signal)
  if (loaded === null) throw new Error('viewer not loadable')
  viewerOnly = loaded
})
afterAll(async () => {
  await handle.drop()
})

const make = (actor: typeof staff, input: Parameters<typeof createSchedule>[2]) =>
  createSchedule(handle.db, actor, { now: NOV_8, ...input }, signal)

describe('report schedules', () => {
  it('a monthly schedule first runs on the first of next month in the town time zone', async () => {
    const made = await make(staff, {
      report: 'permit-volume',
      frequency: 'monthly',
      recipientIds: [staff.userId, admin.userId],
    })
    if (!made.ok) throw new Error(JSON.stringify(made.error))
    const listed = await listSchedules(handle.db, staff, signal)
    if (!listed.ok) throw new Error(listed.error)
    const row = listed.value.find((s) => s.id === made.value.id)
    expect(row).toMatchObject({ nextRunOn: '2026-12-01', paused: false, lastSentAt: null })
    expect(row?.recipients.map((r) => r.id).sort()).toEqual([staff.userId, admin.userId].sort())
  })

  it('refuses a recipient who cannot see the report and names them', async () => {
    const made = await make(staff, {
      report: 'revenue',
      frequency: 'weekly',
      recipientIds: [staff.userId, inspector.userId],
    })
    expect(made.ok).toBe(false)
    if (made.ok || typeof made.error === 'string') throw new Error('expected field errors')
    expect(made.error.invalid.recipientIds).toMatch(/cannot see the Revenue report/)
  })

  it('offers the census report monthly only', async () => {
    const made = await make(staff, {
      report: 'census',
      frequency: 'quarterly',
      recipientIds: [staff.userId],
    })
    expect(made).toEqual({
      ok: false,
      error: { invalid: { frequency: 'The census report goes out monthly.' } },
    })
  })

  it('refuses someone without the reports capability, and a money report to a viewer only', async () => {
    const byInspector = await make(inspector, {
      report: 'permit-volume',
      frequency: 'weekly',
      recipientIds: [staff.userId],
    })
    expect(byInspector).toEqual({ ok: false, error: 'forbidden' })
    const byViewer = await make(viewerOnly, {
      report: 'cash-receipts',
      frequency: 'weekly',
      recipientIds: [staff.userId],
    })
    expect(byViewer).toEqual({ ok: false, error: 'forbidden' })
  })

  it('lists only the schedules for reports the viewer can open', async () => {
    const money = await make(staff, {
      report: 'cash-receipts',
      frequency: 'weekly',
      recipientIds: [staff.userId],
    })
    if (!money.ok) throw new Error('create failed')
    const listed = await listSchedules(handle.db, viewerOnly, signal)
    if (!listed.ok) throw new Error(listed.error)
    expect(listed.value.some((s) => s.id === money.value.id)).toBe(false)
    expect(listed.value.some((s) => s.report === 'permit-volume')).toBe(true)
    expect(await listSchedules(handle.db, inspector, signal)).toEqual({
      ok: false,
      error: 'forbidden',
    })
  })

  it('pausing stops it and resuming picks the next run from today', async () => {
    const made = await make(staff, {
      report: 'processing-time',
      frequency: 'quarterly',
      recipientIds: [staff.userId],
    })
    if (!made.ok) throw new Error('create failed')
    const id = made.value.id
    const paused = await setSchedulePaused(
      handle.db,
      staff,
      { id, paused: true, now: NOV_8 },
      signal,
    )
    expect(paused.ok).toBe(true)
    const resumed = await setSchedulePaused(
      handle.db,
      staff,
      { id, paused: false, now: new Date('2027-01-15T15:00:00Z') },
      signal,
    )
    expect(resumed.ok).toBe(true)
    const listed = await listSchedules(handle.db, staff, signal)
    if (!listed.ok) throw new Error(listed.error)
    expect(listed.value.find((s) => s.id === id)).toMatchObject({
      paused: false,
      nextRunOn: '2027-04-01',
    })
  })

  it('editing the frequency moves the next run, and an inspector cannot edit or delete', async () => {
    const made = await make(staff, {
      report: 'permit-volume',
      frequency: 'monthly',
      recipientIds: [staff.userId],
    })
    if (!made.ok) throw new Error('create failed')
    const id = made.value.id
    const edited = await updateSchedule(
      handle.db,
      staff,
      {
        id,
        report: 'permit-volume',
        frequency: 'weekly',
        recipientIds: [admin.userId],
        now: NOV_8,
      },
      signal,
    )
    expect(edited.ok).toBe(true)
    const listed = await listSchedules(handle.db, staff, signal)
    if (!listed.ok) throw new Error(listed.error)
    expect(listed.value.find((s) => s.id === id)).toMatchObject({
      frequency: 'weekly',
      nextRunOn: '2026-11-09',
      recipients: [{ id: admin.userId }],
    })
    expect(
      await updateSchedule(
        handle.db,
        inspector,
        { id, report: 'permit-volume', frequency: 'monthly', recipientIds: [staff.userId] },
        signal,
      ),
    ).toEqual({ ok: false, error: 'forbidden' })
    expect(await deleteSchedule(handle.db, inspector, { id }, signal)).toEqual({
      ok: false,
      error: 'forbidden',
    })
    expect(await deleteSchedule(handle.db, staff, { id }, signal)).toEqual({
      ok: true,
      value: undefined,
    })
    expect(await deleteSchedule(handle.db, staff, { id }, signal)).toEqual({
      ok: false,
      error: 'not_found',
    })
  })
})
