import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { townSections } from '@/db/schema'
import { actionHarness } from '@/test/testHarness/actions'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))
vi.mock('@/features/mail/transport', () => import('@/test/testHarness/actions/mocks/mailTransport'))

const { addSectionAction, editSectionAction, retireSectionAction } = await import('./actions')

const h = actionHarness()
const SETBACKS = {
  provisionKind: 'zoning_ordinance',
  reference: 'Zoning Ordinance Section 4.2',
  title: 'accessory structure setbacks',
}

async function sectionId(reference: string) {
  const [row] = await h.db
    .select({ id: townSections.id })
    .from(townSections)
    .where(eq(townSections.reference, reference))
  return row?.id ?? ''
}

describe('section list actions', () => {
  it('adds, refuses a duplicate beside the section field, edits and retires', async () => {
    h.signIn(await h.actorFor('admin'))
    expect(await addSectionAction(h.form(SETBACKS))).toEqual({
      ok: true,
      message: 'Zoning Ordinance Section 4.2 added.',
    })
    const message = 'This section is already on the list for that kind.'
    expect(await addSectionAction(h.form(SETBACKS))).toEqual({
      ok: false,
      error: message,
      fieldErrors: { reference: message },
    })
    const id = await sectionId(SETBACKS.reference)
    expect(
      await editSectionAction(h.form({ ...SETBACKS, sectionId: id, title: 'setbacks' })),
    ).toEqual({ ok: true, message: 'Section saved.' })
    expect(await retireSectionAction(h.form({ sectionId: id }))).toEqual({
      ok: true,
      message: 'Section retired.',
    })
  })

  it('adds a typed section with no title', async () => {
    h.signIn(await h.actorFor('admin'))
    const added = await addSectionAction(
      h.form({ provisionKind: 'zoning_ordinance', reference: 'Sign ordinance Section 2' }),
    )
    expect(added.ok).toBe(true)
  })

  it('refuses every action to staff without config.edit', async () => {
    h.signIn(await h.actorFor('admin'))
    await addSectionAction(h.form(SETBACKS))
    const id = await sectionId(SETBACKS.reference)
    h.signIn(await h.actorFor('staff'))
    const forbidden = { ok: false, error: 'You do not have permission to change the section list.' }
    expect(await addSectionAction(h.form({ ...SETBACKS, reference: 'Other' }))).toEqual(forbidden)
    expect(await editSectionAction(h.form({ ...SETBACKS, sectionId: id }))).toEqual(forbidden)
    expect(await retireSectionAction(h.form({ sectionId: id }))).toEqual(forbidden)
  })
})
