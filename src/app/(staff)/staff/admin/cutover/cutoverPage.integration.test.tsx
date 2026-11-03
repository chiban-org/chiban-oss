import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Actor } from '@/features/auth/actor'
import { adoptStarter } from '@/features/config/adoptStarter'
import { reconcileCutover, signOffReconciliation } from '@/features/cutover/reconcile'
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

const signal = new AbortController().signal
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
  it('shows staff one file picker with a check and an import button', async () => {
    state.actor = staff
    const asStaff = renderToStaticMarkup(await CutoverPage())
    expect(asStaff).toContain('Download the CSV template')
    expect(asStaff).toContain('An amount such as 45.00 is not accepted')
    expect(asStaff).not.toContain('Gates are not evaluated')
    expect(asStaff).toContain('Check the file')
    const importButton = asStaff.match(/<button[^>]*>Import the file</)?.[0] ?? ''
    expect(importButton).toContain('name="mode"')
    expect(importButton).toContain('value="import"')
    expect(asStaff.match(/<input type="file"/g)?.length).toBe(2)
    expect(asStaff).toContain('No comparisons yet.')
  })

  it('lists comparisons and offers Sign off only to an admin, only until it is signed', async () => {
    const list = new TextEncoder().encode('legacy_number\nL-1\nL-2\n')
    const made = await reconcileCutover(handle.db, staff, { listBytes: list }, signal)
    if (!made.ok) throw new Error(made.error)
    state.actor = staff
    const asStaff = renderToStaticMarkup(await CutoverPage())
    expect(asStaff).not.toContain('Reconciliation number')
    expect(asStaff).not.toContain('>Sign off<')
    expect(asStaff).toContain('Waiting for an administrator')
    state.actor = admin
    const asAdmin = renderToStaticMarkup(await CutoverPage())
    expect(asAdmin).toContain('>Sign off<')
    expect(asAdmin).toContain(`name="reconciliationId" value="${made.value.id}"`)
    expect((await signOffReconciliation(handle.db, admin, made.value.id, signal)).ok).toBe(true)
    const signed = renderToStaticMarkup(await CutoverPage())
    expect(signed).not.toContain('>Sign off<')
    expect(signed).toContain('Signed off')
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

  it('offers a picker of adopted application types for the template', async () => {
    const adopted = await adoptStarter(handle.db, admin, 'nh.starter.electrical', signal)
    if (!adopted.ok) throw new Error(JSON.stringify(adopted.error))
    state.actor = staff
    const html = renderToStaticMarkup(await CutoverPage())
    expect(html).toMatch(/<form[^>]*action="\/staff\/admin\/cutover\/template\.csv"/)
    expect(html).toMatch(/<select[^>]*name="type"/)
    expect(html).toContain('<option value="EL">Electrical permit</option>')
  })

  it('serves a lowercase type key and refuses an unknown one', async () => {
    state.actor = staff
    const lower = await template(new Request('https://alderpond.example/x?type=el'))
    expect(lower.status).toBe(200)
    expect(await lower.text()).toContain('field.description')
    const unknown = await template(new Request('https://alderpond.example/x?type=zz'))
    expect(unknown.status).toBe(400)
    expect(await unknown.text()).toContain('No adopted application type has the key zz')
  })

  it('serves the base columns to staff', async () => {
    state.actor = staff
    const res = await template(new Request('https://alderpond.example/x'))
    expect(res.status).toBe(200)
    expect(await res.text()).toMatch(/^legacy_number,application_type_key,/)
  })
})
