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
}))
vi.mock('./actions', () => ({
  importCutoverAction: () => Promise.resolve({ ok: true, message: '' }),
  reconcileCutoverAction: () => Promise.resolve({ ok: true, message: '' }),
  signOffReconciliationAction: () => Promise.resolve({ ok: true, message: '' }),
}))

const { default: CutoverPage } = await import('./page')
const { GET: template } = await import('./template.csv/route')

let handle: TestDb
let staff: Actor
let admin: Actor
let reviewer: Actor

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  await seedParcelWorld(handle.db)
  staff = await staffActor(handle.db, 'staff')
  admin = await staffActor(handle.db, 'admin')
  reviewer = await staffActor(handle.db, 'reviewer')
})
afterAll(async () => {
  await handle.drop()
})

describe('cutover page', () => {
  it('shows staff the import forms and only an admin the sign-off form', async () => {
    state.actor = staff
    const asStaff = renderToStaticMarkup(await CutoverPage())
    expect(asStaff).toContain('Download the CSV template')
    expect(asStaff).not.toContain('Reconciliation number')
    state.actor = admin
    expect(renderToStaticMarkup(await CutoverPage())).toContain('Reconciliation number')
  })

  it('refuses a reviewer on the page and on the template', async () => {
    state.actor = reviewer
    expect(renderToStaticMarkup(await CutoverPage())).toContain('You do not have permission')
    const res = await template(new Request('https://alderpond.example/x'))
    expect(res.status).toBe(403)
    state.actor = null
    await expect(CutoverPage()).rejects.toThrow('NEXT_REDIRECT:/staff/sign-in')
    expect((await template(new Request('https://alderpond.example/x'))).status).toBe(403)
  })

  it('serves the base columns to staff', async () => {
    state.actor = staff
    const res = await template(new Request('https://alderpond.example/x'))
    expect(res.status).toBe(200)
    expect(await res.text()).toMatch(/^legacy_number,application_type_key,/)
  })
})
