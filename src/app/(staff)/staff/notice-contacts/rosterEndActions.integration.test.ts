import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { associationRosters } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { upsertAssociation } from '@/features/rosters/associations'
import { type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { staffActor } from '@/test/parcels'
import type { CivilDate } from '@/types/civilDate'

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
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) => (name === 'chiban_csrf' ? { value: 'tok' } : undefined),
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

const { endRosterEntryAction, undoRosterEndAction } = await import('./rosterEndActions')

let handle: TestDb
let world: BoardWorld

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  world = await setupBoardWorld(handle.db)
})
afterAll(async () => {
  await handle.drop()
})

function form(fields: Record<string, string>): FormData {
  const f = new FormData()
  f.set('csrf_token', 'tok')
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

async function association(): Promise<string> {
  const saved = await upsertAssociation(
    handle.db,
    world.staff,
    {
      parcelId: world.parcelId,
      associationName: 'Heron Landing Condominium',
      officers: [{ name: 'Dana Whitcomb', title: 'President', mailingAddress: 'PO Box 105' }],
      asOf: '2027-01-10' as CivilDate,
    },
    signal,
  )
  if (!saved.ok) throw new Error(saved.error)
  const row = await handle.db.query.associationRosters.findFirst()
  return row?.id ?? ''
}

async function endedOn(entryId: string) {
  const [row] = await handle.db
    .select({ endedOn: associationRosters.endedOn })
    .from(associationRosters)
    .where(eq(associationRosters.id, entryId))
  return row?.endedOn ?? null
}

const signal = new AbortController().signal

describe('ending a condo association from Notice contacts', () => {
  it('refuses finance, who lacks abutters.manage, for End and for Undo', async () => {
    const entryId = await association()
    state.actor = await staffActor(handle.db, 'finance')
    const ended = await endRosterEntryAction(
      form({ kind: 'association', entryId, endedOn: '2027-03-01' }),
    )
    expect(ended.ok).toBe(false)
    expect(await endedOn(entryId)).toBeNull()
    const undone = await undoRosterEndAction(form({ kind: 'association', entryId }))
    expect(undone.ok).toBe(false)
  })

  it('ends the association for staff and undoes it while no list has used the ending', async () => {
    const entryId = await association()
    state.actor = world.staff
    expect(
      await endRosterEntryAction(form({ kind: 'association', entryId, endedOn: '2027-03-01' })),
    ).toEqual({ ok: true, message: 'Condo association ended.' })
    expect(await endedOn(entryId)).toBe('2027-03-01')
    expect(await undoRosterEndAction(form({ kind: 'association', entryId }))).toEqual({
      ok: true,
      message: 'The ending was undone.',
    })
    expect(await endedOn(entryId)).toBeNull()
  })

  it('rejects a kind that cannot be ended this way', async () => {
    state.actor = world.staff
    const result = await endRosterEntryAction(
      form({ kind: 'restriction', entryId: crypto.randomUUID(), endedOn: '2027-03-01' }),
    )
    expect(result.ok).toBe(false)
  })
})
