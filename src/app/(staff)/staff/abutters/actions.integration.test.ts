import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { abutterLists } from '@/db/schema'
import { generateList } from '@/features/abutters/lists'
import { resolveParcelId } from '@/features/parcels/resolveParcelId'
import { type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { LIST_NOW, type ListWorld, prepareListWorld } from '@/test/listFixtures'

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

const actions = await import('@/app/(staff)/staff/abutters/actions')
const boardActions = await import('@/app/(staff)/staff/boards/actions')

const signal = new AbortController().signal
let handle: TestDb
let world: BoardWorld
let lw: ListWorld
let listId = ''

function form(values: Record<string, string>, token: string | null = 'tok'): FormData {
  const data = new FormData()
  if (token !== null) data.set('csrf_token', token)
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  return data
}

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  world = await setupBoardWorld(handle.db)
  lw = await prepareListWorld(handle.db, world)
})
afterAll(async () => {
  await handle.drop()
})
beforeEach(async () => {
  state.csrfCookie = 'tok'
  state.actor = world.staff
  await handle.db
    .update(abutterLists)
    .set({ status: 'discarded' })
    .where(eq(abutterLists.status, 'draft'))
  const made = await generateList(
    handle.db,
    world.staff,
    { applicationId: lw.applicationId },
    signal,
    LIST_NOW,
  )
  listId = made.ok ? made.value.listId : ''
})

describe('abutter list actions', () => {
  it('issue action without csrf is refused', async () => {
    const result = await actions.issueListAction(form({ listId }, null))
    expect(result).toMatchObject({ ok: false })
    const [row] = await handle.db.select().from(abutterLists).where(eq(abutterLists.id, listId))
    expect(row?.status).toBe('draft')
  })

  it('issue action with a bad csrf token is refused', async () => {
    state.csrfCookie = 'other'
    expect(await actions.issueListAction(form({ listId }))).toMatchObject({ ok: false })
  })

  it('issue action as reviewer is forbidden', async () => {
    state.actor = world.reviewer
    expect(await actions.issueListAction(form({ listId }))).toEqual({
      ok: false,
      error: 'You do not have permission to do this.',
    })
  })

  it('issue action signed out asks to sign in', async () => {
    state.actor = null
    expect(await actions.issueListAction(form({ listId }))).toEqual({
      ok: false,
      error: 'Sign in to continue.',
    })
  })

  it('issue action as staff issues the list', async () => {
    const result = await actions.issueListAction(form({ listId }))
    expect(result).toEqual({
      ok: true,
      message: 'List issued. Notice costs were calculated from it.',
    })
    const [row] = await handle.db.select().from(abutterLists).where(eq(abutterLists.id, listId))
    expect(row?.status).toBe('issued')
  })

  it('an incomplete list is refused with the reasons in words', async () => {
    await handle.db.execute(
      (await import('drizzle-orm'))
        .sql`update parcels set mailing_address = null where id = ${lw.ids.SW}`,
    )
    const draft = await generateList(
      handle.db,
      world.staff,
      { applicationId: lw.applicationId },
      signal,
      LIST_NOW,
    )
    const result = await actions.issueListAction(
      form({ listId: draft.ok ? draft.value.listId : '' }),
    )
    expect(result).toMatchObject({ ok: false })
    expect(result.ok ? '' : result.error).toContain(
      'The parcel record has no mailing address for Wren, Isolde.',
    )
  })

  it('selecting an unknown parcel is refused in words', async () => {
    const result = await actions.selectParcelAction(
      form({ listId, parcelRef: '999999999999', crossing: 'street', note: 'Across the road' }),
    )
    expect(result).toEqual({
      ok: false,
      error: 'That parcel ID was not found.',
      fieldErrors: { parcelRef: 'That parcel ID was not found.' },
    })
  })

  it('selecting a parcel by its ID adds it', async () => {
    const result = await actions.selectParcelAction(
      form({ listId, parcelRef: '009011000000', crossing: 'street', note: 'Across the road' }),
    )
    expect(result.ok).toBe(true)
  })

  it('selecting a parcel by the record id the parcel picker submits adds it', async () => {
    const found = await resolveParcelId(handle.db, { value: '009012000000' }, signal)
    const result = await actions.selectParcelAction(
      form({
        listId,
        parcelRef: found.ok ? found.value.parcelId : '',
        crossing: 'stream',
        note: 'Across the brook',
      }),
    )
    expect(result.ok).toBe(true)
  })

  it('a reviewer cannot draw a list', async () => {
    state.actor = world.reviewer
    expect(
      await actions.generateListAction(form({ applicationId: lw.applicationId })),
    ).toMatchObject({ ok: false })
  })
})

describe('board actions', () => {
  it('terminate action as reviewer is forbidden', async () => {
    state.actor = world.reviewer
    expect(
      await boardActions.terminateUnpaidAction(
        form({ applicationId: lw.applicationId, reason: 'Late' }),
      ),
    ).toEqual({ ok: false, error: 'You do not have permission to do this.' })
  })

  it('schedule meeting action rejects a missing date', async () => {
    expect(
      await boardActions.scheduleMeetingAction(form({ board: 'zba', kind: 'regular' })),
    ).toEqual({
      ok: false,
      error: 'Enter the meeting date.',
      fieldErrors: { meetingDate: 'Enter the meeting date.' },
    })
  })

  it('schedule meeting action as reviewer is forbidden', async () => {
    state.actor = world.reviewer
    expect(
      await boardActions.scheduleMeetingAction(
        form({ board: 'zba', kind: 'regular', meetingDate: '2027-08-18' }),
      ),
    ).toEqual({ ok: false, error: 'You do not have permission to do this.' })
  })

  it('setting the acceptance meeting from the form succeeds for a timely filing', async () => {
    const result = await boardActions.setAcceptanceMeetingAction(
      form({
        applicationId: lw.applicationId,
        meetingId:
          (await handle.db.query.boardMeetings.findMany()).find(
            (m) => m.meetingDate === '2027-04-14',
          )?.id ?? '',
      }),
    )
    expect(result).toMatchObject({ ok: true })
  })
  it('a water determination of within with no reason always answers in words', async () => {
    const result = await boardActions.desDeterminationAction(
      form({ applicationId: lw.applicationId, determination: 'within_500ft', reason: '' }),
    )
    expect(result.ok ? result.message : result.error).toMatch(/^[A-Z].+\.$/)
  })
})
