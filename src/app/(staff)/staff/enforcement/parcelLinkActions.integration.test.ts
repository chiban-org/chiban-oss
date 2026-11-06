import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { enforcementCases } from '@/db/schema'
import { makeTestDb, type TestDb } from '@/test/db'
import { type EnforcementWorld, setupEnforcementWorld } from '@/test/enforcementFixtures'
import { makeParcel } from '@/test/parcels'

interface MockState {
  db: unknown
  csrfCookie: string | null
  actor: unknown
}

const state = vi.hoisted((): MockState => ({ db: null, csrfCookie: 'tok', actor: null }))

vi.mock('@/db/client', () => ({
  get db() {
    return state.db
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) =>
        name === 'chiban_csrf' && state.csrfCookie !== null
          ? { value: state.csrfCookie }
          : undefined,
    }),
  headers: () =>
    Promise.resolve(
      new Headers({
        origin: 'https://alderpond.example',
        host: 'alderpond.example',
        'sec-fetch-site': 'same-origin',
      }),
    ),
}))
vi.mock('@/server/getActor', () => ({ getActor: () => Promise.resolve(state.actor) }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  },
}))

const main = await import('@/app/(staff)/staff/enforcement/actions')

let handle: TestDb
let world: EnforcementWorld

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  world = await setupEnforcementWorld(handle.db)
})
afterAll(async () => {
  await handle.drop()
})
beforeEach(() => {
  state.csrfCookie = 'tok'
  state.actor = world.staff
})

async function openedAt(fields: Record<string, string>): Promise<string> {
  const failure = await main.openCaseAction(form(fields)).then(JSON.stringify, String)
  return failure.replace(/^Error: NEXT_REDIRECT:/, '')
}

function form(fields: Record<string, string>, token: string | null = 'tok'): FormData {
  const f = new FormData()
  if (token !== null) f.set('csrf_token', token)
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

describe('enforcement server actions', () => {
  it('a case opened with a parcel number or exact site address is linked to that parcel', async () => {
    const parcelId = await makeParcel(handle.db, [{ format: 'gis12', value: '031004000000' }], {
      siteAddress: '4 Linden Way',
    })
    await openedAt({ locationText: 'Behind the barn', parcelRef: '031-004-000-000' })
    const byAddress = await main.staffComplaintAction(
      form({ locationText: '4 linden way', description: 'Junk cars in the yard' }),
    )
    expect(byAddress.ok).toBe(true)
    const linked = await handle.db
      .select({ parcelId: enforcementCases.parcelId })
      .from(enforcementCases)
      .where(eq(enforcementCases.parcelId, parcelId))
    expect(linked).toHaveLength(2)
  })

  it('a case without a parcel can be linked to one from the case page', async () => {
    const parcelId = await makeParcel(handle.db, [{ format: 'gis12', value: '031005000000' }])
    await openedAt({ locationText: 'Unnamed lot' })
    const [row] = await handle.db
      .select()
      .from(enforcementCases)
      .where(eq(enforcementCases.locationText, 'Unnamed lot'))
    const linked = await main.setCaseParcelAction(
      form({ caseId: row?.id ?? '', parcelRef: '031005000000' }),
    )
    expect(linked.ok).toBe(true)
    const [after] = await handle.db
      .select()
      .from(enforcementCases)
      .where(eq(enforcementCases.id, row?.id ?? ''))
    expect(after?.parcelId).toBe(parcelId)
  })

  it('a parcel chosen in the picker links by its record id and the new case opens', async () => {
    const parcelId = await makeParcel(handle.db, [{ format: 'gis12', value: '031006000000' }])
    const path = await openedAt({
      locationText: 'Gravel pit off the county road',
      parcelRef: parcelId,
    })
    const [row] = await handle.db
      .select({ id: enforcementCases.id, parcelId: enforcementCases.parcelId })
      .from(enforcementCases)
      .where(eq(enforcementCases.locationText, 'Gravel pit off the county road'))
    expect(row?.parcelId).toBe(parcelId)
    expect(path).toBe(`/staff/enforcement/${row?.id}`)
  })
})
