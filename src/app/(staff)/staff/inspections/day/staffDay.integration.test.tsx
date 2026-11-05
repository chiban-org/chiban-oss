import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { makeTestDb, type TestDb } from '@/test/db'
import { type InspectionWorld, setupInspectionWorld } from '@/test/inspectionFixtures'
import { staffActor } from '@/test/parcels'

const state = vi.hoisted((): { db: unknown; actor: unknown } => ({ db: null, actor: null }))

vi.mock('@/db/client', () => ({
  get db() {
    return state.db
  },
}))
vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ get: () => undefined }),
  headers: () => Promise.resolve(new Headers()),
}))
vi.mock('@/server/getActor', () => ({ getActor: () => Promise.resolve(state.actor) }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  notFound: () => {
    throw new Error('NOT_FOUND')
  },
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  },
}))

const { default: DayPage } = await import('@/app/(staff)/staff/inspections/day/page')

let handle: TestDb
let w: InspectionWorld

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  w = await setupInspectionWorld(handle.db)
  state.actor = await staffActor(handle.db, 'staff')
})
afterAll(async () => {
  await handle.drop()
})

async function dayHtml(searchParams: Record<string, string> = {}): Promise<string> {
  return renderToStaticMarkup(
    (await DayPage({ searchParams: Promise.resolve(searchParams) })) as never,
  )
}

describe('Inspector day for staff who are not inspectors', () => {
  it('asks which inspector instead of showing one inspector as their own day', async () => {
    const html = await dayHtml()
    expect(html).toContain('Choose an inspector')
    expect(html).toContain(`inspector=${w.inspector.userId}`)
    expect(html).not.toContain('Your day')
  })

  it('shows the chosen inspector day with their name', async () => {
    const html = await dayHtml({ inspector: w.inspector.userId })
    expect(html).not.toContain('Choose an inspector')
    expect(html).toContain('Previous day')
  })
})
