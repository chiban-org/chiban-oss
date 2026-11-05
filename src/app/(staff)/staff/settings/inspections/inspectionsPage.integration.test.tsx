import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
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
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))

const { default: InspectionSettingsPage } = await import('./page')

let handle: TestDb

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  await seedParcelWorld(handle.db)
  state.actor = await staffActor(handle.db, 'admin')
})
afterAll(async () => {
  await handle.drop()
})

describe('inspection schedule page', () => {
  it('keeps the Microsoft connection details folded away under a plain heading', async () => {
    const html = renderToStaticMarkup(await InspectionSettingsPage())
    expect(html).toContain('<h2>Microsoft 365 connection</h2>')
    expect(html).not.toContain('<h2>Microsoft tenant</h2>')
    expect(html).toMatch(
      /<details[^>]*><summary[^>]*>Enter the connection details<\/summary>[\s\S]*name="tenantId"/,
    )
  })

  it('links to the schedule board only for someone who can schedule inspections', async () => {
    const admin = state.actor
    const board = 'href="/staff/inspections"'
    const adminHtml = renderToStaticMarkup(await InspectionSettingsPage())
    expect(adminHtml).not.toContain(board)
    expect(adminHtml).toContain('only staff who can schedule inspections can open it')
    state.actor = await staffActor(handle.db, 'staff')
    try {
      expect(renderToStaticMarkup(await InspectionSettingsPage())).toContain(board)
    } finally {
      state.actor = admin
    }
  })
})
