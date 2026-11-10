import { readFileSync } from 'node:fs'
import path from 'node:path'
import { eq, like, sql } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { env } from '@/config/env'
import { applications, projects, users } from '@/db/schema'
import { boardIdOf } from '@/features/boards/townBoards'
import { getPublished, getVersion } from '@/features/config/store'
import { demoResetAllowed, resetDemoDatabase } from '@/features/demo/demoReset'
import { parseDemoOverlay } from '@/features/demo/overlay/checkOverlay'
import type { FeeScheduleBody } from '@/features/fees/feeSchema'
import { getTownSettings } from '@/features/town/settings'
import { makeTestDb, type TestDb } from '@/test/db'
import { demoSeedDeps } from '@/test/demoSeedDeps'
import { makeUser } from '@/test/factories'

let handle: TestDb
const signal = new AbortController().signal
const original = { nodeEnv: env.NODE_ENV, dev: env.ENABLE_DEV_SIGN_IN }
const EXAMPLE = path.resolve(import.meta.dirname, '../../../docs/demo-overlay.example.json')

function exampleOverlay() {
  const json = JSON.parse(readFileSync(EXAMPLE, 'utf8'))
  const parsed = parseDemoOverlay({ ...json, town: { name: 'Town of Alder Pond Village' } })
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.error))
  return parsed.value
}

async function published<T>(
  kind: 'fee_schedule' | 'town_profile' | 'payment_settings',
  key: string,
) {
  return (await getPublished(handle.db, kind, key, signal))?.body as T
}

async function pinnedBuildingFee(): Promise<FeeScheduleBody> {
  const [app] = await handle.db
    .select({ pins: applications.configPins })
    .from(applications)
    .innerJoin(projects, eq(projects.id, applications.projectId))
    .where(like(projects.title, '%Addition under review'))
  const pins = app?.pins as { feeSchedule: string }
  return (await getVersion(handle.db, pins.feeSchedule, signal))?.body as FeeScheduleBody
}

beforeAll(async () => {
  handle = await makeTestDb()
})
afterAll(async () => {
  await handle.drop()
})
afterEach(() => {
  env.NODE_ENV = original.nodeEnv
  env.ENABLE_DEV_SIGN_IN = original.dev
  env.CHIBAN_DEMO_MODE = false
})

describe('demo reset', () => {
  it('runs only on a dev database with dev sign-in or on a demo', () => {
    env.NODE_ENV = 'production'
    env.ENABLE_DEV_SIGN_IN = true
    expect(demoResetAllowed()).toBe(false)
    env.CHIBAN_DEMO_MODE = true
    expect(demoResetAllowed()).toBe(true)
    env.NODE_ENV = 'development'
    env.CHIBAN_DEMO_MODE = false
    expect(demoResetAllowed()).toBe(true)
    env.ENABLE_DEV_SIGN_IN = false
    expect(demoResetAllowed()).toBe(false)
  })

  it('refuses to touch the database when it is not allowed', async () => {
    env.NODE_ENV = 'production'
    await makeUser(handle.db, { email: 'kept@alderpond.example' })
    const result = await resetDemoDatabase(handle.db, signal, await demoSeedDeps())
    expect(result).toEqual({ ok: false, error: 'not_allowed' })
    const kept = await handle.db
      .select()
      .from(users)
      .where(eq(users.email, 'kept@alderpond.example'))
    expect(kept).toHaveLength(1)
  })

  it('empties the database, migrates it and seeds the demo again', async () => {
    env.NODE_ENV = 'production'
    env.CHIBAN_DEMO_MODE = true
    await makeUser(handle.db, { email: 'visitor.made@alderpond.example' })
    const result = await resetDemoDatabase(handle.db, signal, await demoSeedDeps())
    expect(result.ok).toBe(true)
    const emails = (await handle.db.select({ email: users.email }).from(users)).map((u) => u.email)
    expect(emails).toContain('admin@alderpond.example')
    expect(emails).not.toContain('visitor.made@alderpond.example')
    expect(emails).not.toContain('kept@alderpond.example')
  }, 180_000)

  it('leaves the half-seeded tables alone when the reset is cancelled during an overlay seed', async () => {
    env.NODE_ENV = 'production'
    env.CHIBAN_DEMO_MODE = true
    const controller = new AbortController()
    const name = 'Town of Alder Pond Cancelled'
    const reset = resetDemoDatabase(handle.db, controller.signal, {
      ...(await demoSeedDeps()),
      overlay: { ...exampleOverlay(), town: { name } },
    })
    const settled = reset.then(
      () => 'resolved',
      () => 'rejected',
    )
    for (;;) {
      const named = await handle.db
        .execute(sql`select to_regclass('public.town_settings') is not null as ready`)
        .then((r) => r.rows[0]?.ready === true)
      const town = named ? await getTownSettings(handle.db, signal) : null
      if (town?.ok === true && town.value.name === name) break
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    controller.abort()
    expect(await settled).toBe('rejected')
    const tables = await handle.db.execute(sql`select to_regclass('public.users') as t`)
    expect(tables.rows[0]?.t).not.toBeNull()
  }, 420_000)

  it('falls back to the plain demo and fails loudly when the seed cannot run with the overlay', async () => {
    env.NODE_ENV = 'production'
    env.CHIBAN_DEMO_MODE = true
    const required = { key: 'lake_frontage', label: 'Lake frontage', type: 'text', required: true }
    const parsed = parseDemoOverlay({
      version: 1,
      town: { name: 'Town of Alder Pond Village' },
      starters: ['BP'],
      applicationTypes: { BP: { formFields: [required] } },
    })
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.error))
    const result = await resetDemoDatabase(handle.db, signal, {
      ...(await demoSeedDeps()),
      overlay: parsed.value,
    })
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toEqual({
      overlay: expect.stringContaining('the demo seed failed with the overlay applied'),
    })
    const town = await getTownSettings(handle.db, signal)
    expect(town.ok && town.value.name).toBe('Town of Alder Pond')
    const emails = (await handle.db.select({ email: users.email }).from(users)).map((u) => u.email)
    expect(emails).toContain('admin@alderpond.example')
  }, 420_000)

  it('applies the example overlay so seeded cases and new ones carry its fees and profile', async () => {
    env.NODE_ENV = 'production'
    env.CHIBAN_DEMO_MODE = true
    const result = await resetDemoDatabase(handle.db, signal, {
      ...(await demoSeedDeps()),
      overlay: exampleOverlay(),
    })
    if (!result.ok) throw new Error(JSON.stringify(result.error))
    expect(result.value.overlay).toEqual({
      notInstalled: [],
      changedTypes: ['BP', 'EL', 'SG', 'SUB', 'SPR', 'VAR', 'AAD'],
    })
    const town = await getTownSettings(handle.db, signal)
    expect(town.ok && town.value.name).toBe('Town of Alder Pond Village')
    const building = (await pinnedBuildingFee()).lines.find((l) => l.code === 'building')
    expect(JSON.stringify(building?.expr)).toContain('"centsPerUnit":32')
    const variance = await published<FeeScheduleBody>('fee_schedule', 'var-fees')
    expect(variance.lines.map((l) => [l.code, l.expr])).toEqual([
      ['application', { op: 'flat', cents: 12500 }],
      [
        'notice_mail',
        {
          op: 'per_unit',
          source: { kind: 'count_of', what: 'abutters_on_issued_list' },
          centsPerUnit: 900,
        },
      ],
      ['notice_newspaper', { op: 'flat', cents: 8000 }],
    ])
    const profile = await published<{
      phone: string
      letterhead: { footerText: string }
      boardOverrides: Record<string, { officeName?: string }>
    }>('town_profile', 'default')
    expect(profile.phone).toBe('603-555-0199')
    expect(profile.letterhead.footerText).toBe('Town of Alder Pond Land Use Department.')
    expect(profile.boardOverrides[await boardIdOf(handle.db, 'zba')]?.officeName).toBe(
      'Alder Pond Zoning Board of Adjustment',
    )
    const payments = await published<{ receiptFooter: string }>('payment_settings', 'default')
    expect(payments.receiptFooter).toBe(
      'Questions about this receipt: Alder Pond Land Use Department.',
    )
    const boards = await getPublished(handle.db, 'board_settings', 'default', signal)
    const planning = await boardIdOf(handle.db, 'planning_board')
    const entry = (
      boards?.body as { boards: { boardId: string; publicNotice: { newspaper: string } }[] }
    ).boards.find((b) => b.boardId === planning)
    expect(entry?.publicNotice.newspaper).toBe('Alder Pond Courier')
  }, 240_000)
})
