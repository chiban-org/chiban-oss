import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { exportsTable, townSettings } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { makeTestDb, type TestDb } from '@/test/db'
import { seedParcelWorld, staffActor } from '@/test/parcels'

interface MockState {
  db: unknown
  actor: Actor | null
}

const state = vi.hoisted((): MockState => ({ db: null, actor: null }))

vi.mock('@/db/client', () => ({
  get db() {
    return state.db
  },
}))
vi.mock('@/server/getActor', () => ({ getActor: () => Promise.resolve(state.actor) }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  },
}))
vi.mock('@/app/(staff)/staff/admin/export/actions', () => ({
  requestExportAction: () => Promise.resolve({ ok: true, message: '' }),
}))

const { default: ExportPage } = await import('./page')

let handle: TestDb
let admin: Actor
let staff: Actor

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  await seedParcelWorld(handle.db)
  admin = await staffActor(handle.db, 'admin')
  staff = await staffActor(handle.db, 'staff')
  await handle.db.insert(exportsTable).values({
    kind: 'business',
    status: 'ready',
    storageKey: 'exports/x/chiban-export-2026-11-02.zip',
    sizeBytes: 2048,
    requestedBy: admin.userId,
    requestedAt: new Date('2026-11-03T01:00:00Z'),
    finishedAt: new Date('2026-11-03T02:00:00Z'),
    expiresAt: new Date('2026-11-10T02:00:00Z'),
  })
})
afterAll(async () => {
  await handle.drop()
})

describe('export page', () => {
  it('shows an admin the request button and dates in the town time zone in long form', async () => {
    state.actor = admin
    const html = renderToStaticMarkup(await ExportPage())
    expect(html).toContain('Request a new export')
    expect(html).toContain('November 2, 2026')
    expect(html).toContain('November 9, 2026')
    expect(html).toContain('/staff/admin/export/')
  })

  it('tells staff without the capability they cannot use it', async () => {
    state.actor = staff
    const html = renderToStaticMarkup(await ExportPage())
    expect(html).toContain('You do not have permission')
    expect(html).not.toContain('Request a new export')
  })

  it('redirects a signed-out visitor to sign in', async () => {
    state.actor = null
    await expect(ExportPage()).rejects.toThrow('NEXT_REDIRECT:/staff/sign-in')
  })

  it('shows a human message for a refused recovery export next to the form', async () => {
    state.actor = admin
    const html = renderToStaticMarkup(
      await ExportPage({
        searchParams: Promise.resolve({ recovery_error: 'invalid_credentials' }),
      }),
    )
    expect(html).toContain('Your password or authenticator code was not right')
    expect(html).not.toContain('invalid_credentials')
    const unknown = renderToStaticMarkup(
      await ExportPage({ searchParams: Promise.resolve({ recovery_error: '<b>x</b>' }) }),
    )
    expect(unknown).not.toContain('<b>x</b>')
  })

  it('only claims an export does not interrupt anyone while the service is active', async () => {
    state.actor = admin
    expect(renderToStaticMarkup(await ExportPage())).toContain(
      'Preparing an export does not interrupt anyone using Chiban.',
    )
    await handle.db.update(townSettings).set({
      serviceStatus: 'terminated',
      serviceStatusSince: '2020-01-01',
      exportWindowDays: 36500,
    })
    const html = renderToStaticMarkup(await ExportPage())
    expect(html).not.toContain('does not interrupt anyone')
    expect(html).toContain('Nobody is using Chiban now')
  })
})
