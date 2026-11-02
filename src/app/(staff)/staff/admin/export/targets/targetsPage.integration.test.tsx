import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { exportTargets } from '@/db/schema'
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
vi.mock('@/app/(staff)/staff/admin/export/targets/actions', () => ({
  saveTargetAction: () => Promise.resolve({ ok: true, message: '' }),
  setTargetActiveAction: () => Promise.resolve({ ok: true, message: '' }),
  runTargetNowAction: () => Promise.resolve({ ok: true, message: '' }),
}))

const { default: TargetsPage } = await import('./page')

const NOTE =
  'OneDrive and SharePoint copies are not connected to a live Microsoft 365 tenant. They have only been tested against a local stand-in.'

let handle: TestDb
let admin: Actor
let reviewer: Actor

function notes(html: string): string[] {
  return [...html.matchAll(/<[^>]*role="note"[^>]*>([\s\S]*?)<\/(?:div|p|aside)>/g)].map((m) =>
    (m[1] ?? '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim(),
  )
}

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  await seedParcelWorld(handle.db)
  admin = await staffActor(handle.db, 'admin')
  reviewer = await staffActor(handle.db, 'reviewer')
})
afterAll(async () => {
  await handle.drop()
})

describe('export targets page', () => {
  it('shows the stub note beside the kind choice before any target exists', async () => {
    state.actor = admin
    const html = renderToStaticMarkup(await TargetsPage())
    expect(html).toContain('Add a local folder')
    expect(html).toContain('Add an S3 bucket')
    expect(html).toContain('Add a OneDrive or SharePoint')
    expect(notes(html)).toContain(NOTE)
    expect(html).not.toContain(String.fromCodePoint(0x2014))
  })

  it('lists targets with dates in the town time zone and repeats the note on a OneDrive target', async () => {
    await handle.db.insert(exportTargets).values([
      {
        kind: 'local_fs',
        name: 'Town server',
        settings: { root: '/srv/chiban-copy' },
        dayOfMonth: 4,
        lastSuccessAt: new Date('2026-11-03T02:00:00Z'),
      },
      {
        kind: 'onedrive',
        name: 'Clerk OneDrive',
        settings: { tenantId: 't', clientId: 'c', driveId: 'd' },
        credentialsEnc: 'v1:secret:blob',
        lastFailureAt: new Date('2026-11-10T14:00:00Z'),
        lastError: 'Microsoft refused the request (403)',
      },
    ])
    state.actor = admin
    const html = renderToStaticMarkup(await TargetsPage())
    expect(html).toContain('Town server')
    expect(html).toContain('November 2, 2026')
    expect(html).toContain('Clerk OneDrive')
    expect(html).toContain('Microsoft refused the request (403)')
    expect(html).toContain('Run now')
    expect(html).toContain('Turn off')
    expect(html).not.toContain('v1:secret:blob')
    expect(notes(html).filter((n) => n === NOTE).length).toBeGreaterThanOrEqual(2)
  })

  it('refuses a reviewer', async () => {
    state.actor = reviewer
    const html = renderToStaticMarkup(await TargetsPage())
    expect(html).toContain('You do not have permission')
    expect(html).not.toContain('Town server')
    expect(html).not.toContain('Add a local folder')
  })

  it('redirects a signed-out visitor to sign in', async () => {
    state.actor = null
    await expect(TargetsPage()).rejects.toThrow('NEXT_REDIRECT:/staff/sign-in')
  })
})
