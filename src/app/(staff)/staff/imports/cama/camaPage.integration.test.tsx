import { eq } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { gisLayers } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { CAMA_ADAPTER_STATUS, CAMA_STUB_NOTICE } from '@/features/cama/mapping'
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
  useRouter: () => ({ refresh: () => undefined }),
}))
vi.mock('./actions', () => ({
  previewCamaAction: () => Promise.resolve({ ok: false, error: '' }),
  saveCamaMappingAction: () => Promise.resolve({ ok: true, message: '' }),
  runCamaImportAction: () => Promise.resolve({ ok: false, error: '' }),
}))
vi.mock('../../gis/imports/actions', () => ({
  updateLayerSettingsAction: () => Promise.resolve({ ok: true, message: '' }),
  runLayerRefreshAction: () => Promise.resolve({ ok: true, message: '' }),
}))

const { default: CamaPage } = await import('./page')
const { default: ImportsPage } = await import('../../gis/imports/page')

const NOTICE =
  "The Avitar export layout has not been checked against a real Avitar file. The columns below are the Chiban CSV layout. Match your own file's columns with the pickers before you run an import."

let handle: TestDb
let staff: Actor
let reviewer: Actor

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  await seedParcelWorld(handle.db)
  staff = await staffActor(handle.db, 'staff')
  reviewer = await staffActor(handle.db, 'reviewer')
})
afterAll(async () => {
  await handle.drop()
})

describe('CAMA import page', () => {
  it('is stubbed and says so in the exact words', () => {
    expect(CAMA_ADAPTER_STATUS).toBe('stubbed')
    expect(CAMA_STUB_NOTICE).toBe(NOTICE)
    expect(NOTICE).not.toContain(String.fromCharCode(0x2014))
    expect(NOTICE).not.toContain(String.fromCharCode(0x2013))
  })

  it('shows the not-checked notice in a visible note block near the top', async () => {
    state.actor = staff
    const html = renderToStaticMarkup(await CamaPage())
    expect(html).toMatch(/<div role="note"[^>]*><p>The Avitar export layout has not been checked/)
    expect(html).toContain(NOTICE.replace("'", '&#x27;'))
    expect(html.indexOf('role="note"')).toBeLessThan(html.indexOf('Column mapping'))
  })

  it('offers the default layout, the pickers and the import controls', async () => {
    state.actor = staff
    const html = renderToStaticMarkup(await CamaPage())
    expect(html).toContain('Chiban CAMA CSV v1 layout')
    expect(html).toContain('map, lot, sub, unit, owner_1, owner_2')
    for (const label of [
      'Encoding',
      'Delimiter',
      'Owner name',
      'Mailing address',
      'Site address',
    ]) {
      expect(html).toContain(label)
    }
    expect(html).toContain('Read the file and preview')
    expect(html).toContain('Save mapping')
    expect(html).toContain('Run import')
  })

  it('writes the last success as a long date in the town zone', async () => {
    state.actor = staff
    await handle.db
      .update(gisLayers)
      .set({ adapter: 'file_cama_csv', lastSuccessAt: new Date('2027-01-05T03:00:00Z') })
      .where(eq(gisLayers.key, 'cama'))
    const html = renderToStaticMarkup(await CamaPage())
    expect(html).toContain('Last success January 4, 2027')
  })

  it('refuses a reviewer and sends a signed-out visitor to sign in', async () => {
    state.actor = reviewer
    expect(renderToStaticMarkup(await CamaPage())).toContain('You do not have permission')
    state.actor = null
    await expect(CamaPage()).rejects.toThrow('NEXT_REDIRECT:/staff/sign-in')
  })

  it('is reachable from the Imports page', async () => {
    state.actor = staff
    const html = renderToStaticMarkup(await ImportsPage({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('href="/staff/imports/cama"')
    expect(html).not.toContain('name="layerKey" value="cama"')
  })
})
