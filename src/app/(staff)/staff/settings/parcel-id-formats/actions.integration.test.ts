import { describe, expect, it, vi } from 'vitest'
import { makeParcel } from '@/test/parcels'
import { actionHarness } from '@/test/testHarness/actions'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))
vi.mock('@/features/mail/transport', () => import('@/test/testHarness/actions/mocks/mailTransport'))

const { addFormatAction, deleteFormatAction, displayFormatAction, editFormatAction } = await import(
  './actions'
)

const h = actionHarness()

describe('parcel ID format actions', () => {
  it('adds a format and refuses a repeated short name beside its field', async () => {
    h.signIn(await h.actorFor('admin'))
    const input = { key: 'town_pid', label: 'Town parcel ID', kind: 'free_text' }
    expect(await addFormatAction(h.form(input))).toEqual({
      ok: true,
      message: 'Town parcel ID added.',
    })
    const message = 'Another format already uses that short name.'
    expect(await addFormatAction(h.form(input))).toEqual({
      ok: false,
      error: message,
      fieldErrors: { key: message },
    })
  })

  it('rejects a short name with capitals', async () => {
    h.signIn(await h.actorFor('admin'))
    const refused = await addFormatAction(
      h.form({ key: 'Town PID', label: 'Town', kind: 'free_text' }),
    )
    expect(refused.ok).toBe(false)
  })

  it('explains in plain words why a used format cannot be narrowed or deleted', async () => {
    h.signIn(await h.actorFor('admin'))
    await makeParcel(h.db, [{ format: 'gis12', value: '007001000000' }])
    const narrowed = await editFormatAction(
      h.form({ key: 'gis12', label: 'Map-lot ID', kind: 'digits', width: '10' }),
    )
    expect(narrowed).toMatchObject({
      ok: false,
      error: expect.stringContaining(
        '1 parcel ID already saved in this format would no longer fit',
      ),
    })
    expect(await displayFormatAction(h.form({ key: 'cama15' }))).toEqual({
      ok: true,
      message: 'Display format changed.',
    })
    expect(await deleteFormatAction(h.form({ key: 'gis12' }))).toEqual({
      ok: false,
      error: 'Parcel IDs, imports or links already use this format, so it cannot be deleted.',
    })
  })

  it('refuses a staff member without settings access', async () => {
    h.signIn(await h.actorFor('staff'))
    expect(
      await addFormatAction(h.form({ key: 'town_pid', label: 'Town', kind: 'free_text' })),
    ).toEqual({ ok: false, error: 'You do not have permission to change parcel ID formats.' })
  })
})
