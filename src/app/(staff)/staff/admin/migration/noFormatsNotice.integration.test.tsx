import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Actor } from '@/features/auth/actor'
import { makeTestDb, type TestDb } from '@/test/db'
import { importerActor } from '@/test/migrationFixtures'
import { seedParcelWorld } from '@/test/parcels'

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
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
vi.mock('./actions', () => ({
  publishMigrationBatchAction: () => Promise.resolve({ ok: true, message: '' }),
}))

const { default: ListPage } = await import('./page')

let handle: TestDb

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  await seedParcelWorld(handle.db)
  state.actor = await importerActor(handle.db)
})
afterAll(async () => {
  await handle.drop()
})

describe('scanned property files with no parcel ID format', () => {
  it('shows nothing extra while a format exists', async () => {
    const html = renderToStaticMarkup(await ListPage())
    expect(html).not.toContain('/staff/settings/parcel-id-formats')
  })

  it('sends staff to the parcel ID formats screen when none exist', async () => {
    await handle.db.execute((await import('drizzle-orm')).sql`delete from parcel_id_formats`)
    const html = renderToStaticMarkup(await ListPage())
    expect(html).toContain('href="/staff/settings/parcel-id-formats"')
    expect(html).toContain('No parcel ID formats are set up yet')
  })
})
