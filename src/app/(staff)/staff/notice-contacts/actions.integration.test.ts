import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Actor } from '@/features/auth/actor'
import { rosterStatus } from '@/features/rosters/reviews'
import { type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
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

const actions = await import('./actions')
const confirms = await import('./confirmActions')

let handle: TestDb
let world: BoardWorld

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  world = await setupBoardWorld(handle.db)
  state.actor = world.staff
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

describe('easement and restriction holders', () => {
  it('an unknown parcel ID is named as the problem', async () => {
    const result = await actions.addRestrictionAction(
      form({
        parcelRef: '999999999999',
        holderName: 'Alder Pond Land Trust',
        holderMailingAddress: '1 Trust Way, Alder Pond NH 03999',
        restrictionKind: 'conservation',
        recordedReference: 'Book 1 Page 2',
      }),
    )
    expect(result).toEqual({
      ok: false,
      error: 'No parcel has the ID 999999999999. Check the parcel ID and try again.',
      fieldErrors: {
        parcelRef: 'No parcel has the ID 999999999999. Check the parcel ID and try again.',
      },
    })
  })

  it('accepts the parcel record id the parcel picker submits', async () => {
    const result = await actions.addRestrictionAction(
      form({
        parcelRef: world.parcelId,
        holderName: 'Alder Pond Land Trust',
        holderMailingAddress: '1 Trust Way, Alder Pond NH 03999',
        restrictionKind: 'conservation',
        recordedReference: 'Book 1 Page 3',
      }),
    )
    expect(result).toEqual({ ok: true, message: 'Restriction holder added.' })
  })
})

describe('row actions on a holder', () => {
  const FORBIDDEN = { ok: false, error: 'You do not have permission to do this.' }

  async function holdingId(): Promise<string> {
    const rows = await handle.db.query.restrictionHoldings.findMany()
    return rows[0]?.id ?? ''
  }

  it('confirms a holder still correct, and refuses a reviewer', async () => {
    const entryId = await holdingId()
    state.actor = world.reviewer
    expect(await confirms.confirmEntryAction(form({ kind: 'restriction', entryId }))).toEqual(
      FORBIDDEN,
    )
    state.actor = world.staff
    expect(await confirms.confirmEntryAction(form({ kind: 'restriction', entryId }))).toEqual({
      ok: true,
      message: 'Marked as still correct today.',
    })
    expect(await confirms.confirmEntryAction(form({ kind: 'nonsense', entryId }))).toEqual({
      ok: false,
      error: 'Choose what to confirm.',
      fieldErrors: { kind: 'Choose what to confirm.' },
    })
  })

  it('ends a holder on the chosen date, then undoes it', async () => {
    const id = await holdingId()
    expect(
      await actions.endRestrictionAction(form({ holdingId: id, endedOn: '2026-01-15' })),
    ).toEqual({ ok: true, message: 'Restriction ended.' })
    const ended = await handle.db.query.restrictionHoldings.findFirst()
    expect(ended?.endedOn).toBe('2026-01-15')
    expect(await confirms.confirmEntryAction(form({ kind: 'restriction', entryId: id }))).toEqual({
      ok: false,
      error: 'This contact has ended, so it cannot be confirmed as still correct.',
    })
    state.actor = world.reviewer
    expect(await actions.undoRestrictionEndAction(form({ holdingId: id }))).toEqual(FORBIDDEN)
    state.actor = world.staff
    expect(await actions.undoRestrictionEndAction(form({ holdingId: id }))).toEqual({
      ok: true,
      message: 'The ending was undone.',
    })
  })

  it('records today as the land records check, and refuses a reviewer', async () => {
    state.actor = world.reviewer
    expect(await actions.recordLandRecordsCheckAction(form({}))).toEqual(FORBIDDEN)
    state.actor = world.staff
    expect(await actions.recordLandRecordsCheckAction(form({}))).toEqual({
      ok: true,
      message: 'Land records check recorded.',
    })
    const status = await rosterStatus(
      handle.db,
      'restrictions',
      '2099-01-01' as CivilDate,
      new AbortController().signal,
    )
    expect(status.state).toBe('reviewed')
  })
})
