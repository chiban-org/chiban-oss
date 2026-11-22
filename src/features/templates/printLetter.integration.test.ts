import { ME_PACK } from '@packs/me'
import { eq } from 'drizzle-orm'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  LettersForm,
  LoadedLetters,
} from '@/app/(staff)/staff/applications/[applicationId]/printLetterPanel'
import { applicationConditions, documents, parcels } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { adoptStarter } from '@/features/config/adoptStarter'
import { setActivePackForTest } from '@/features/packs/registry'
import type { ObjectStore } from '@/features/storage/objectStore'
import { lettersFor, printLetter } from '@/features/templates/printLetter'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { downloadObject } from '@/test/objectBytes'
import { makeTestStore } from '@/test/objectStore'
import { pdfText } from '@/test/pdfText'

const panel = vi.hoisted((): { db: unknown; actor: unknown } => ({ db: null, actor: null }))

vi.mock('@/server/requireStaff', async (original) => ({
  ...(await original<typeof import('@/server/requireStaff')>()),
  requireStaffContext: () =>
    Promise.resolve({ db: panel.db, actor: panel.actor, signal: new AbortController().signal }),
}))

const signal = new AbortController().signal
const NOW = new Date('2027-03-02T17:00:00Z')
const OWNER = 'Marisol Tennant'
const CONDITIONS = ['Keep the shed 12 feet from the brook', 'Plant a hedge along the east line']
let handle: TestDb
let world: PermitWorld
let store: ObjectStore
let variance: string
let building: string

beforeAll(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db)
  store = (await makeTestStore()).store
  building = (await makeApplication(handle.db, world, { state: 'submitted' }, NOW)).applicationId
  setActivePackForTest(ME_PACK)
  const adopted = await adoptStarter(handle.db, world.admin, 'me.starter.boa_variance', signal)
  expect(adopted.ok ? 'ok' : adopted.error).toBe('ok')
  await handle.db.update(parcels).set({ ownerName: OWNER }).where(eq(parcels.id, world.parcelId))
  variance = (
    await makeApplication(
      handle.db,
      world,
      { state: 'decided', receivedDate: '2027-02-01', decidedOn: '2027-03-01' },
      NOW,
      'VAR',
    )
  ).applicationId
  await handle.db.insert(applicationConditions).values(
    CONDITIONS.map((text, i) => ({
      applicationId: variance,
      code: `C${i}`,
      textSnapshot: text,
      blocksIssuance: false,
      changedBy: world.staff.userId,
    })),
  )
})
beforeEach(() => {
  setActivePackForTest(ME_PACK)
})
afterAll(async () => {
  setActivePackForTest(null)
  await handle.drop()
})

describe('printing a letter template against an application', () => {
  it('lists the letter templates pinned to the variance type', async () => {
    const letters = await lettersFor(handle.db, variance, signal)
    expect(letters.map((l) => l.key)).toEqual(
      expect.arrayContaining(['var-recording-certificate', 'var-decision']),
    )
    expect(letters.find((l) => l.key === 'var-recording-certificate')?.label).toBe(
      'Variance recording certificate',
    )
  })

  it('offers the pinned letters in the Letters panel', async () => {
    const letters = await lettersFor(handle.db, variance, signal)
    const html = renderToStaticMarkup(
      createElement(LettersForm, { applicationId: variance, letters }),
    )
    expect(html).toContain('<h2>Letters</h2>')
    expect(html).toContain('Variance recording certificate')
    expect(html).toContain('Print the letter')
  })

  it('the self-loading panel shows the letters to staff, and nothing where there are none or to a reviewer', async () => {
    panel.db = handle.db
    const as = async (actor: Actor, applicationId: string) => {
      panel.actor = actor
      const element = await LoadedLetters({ applicationId })
      return element === null ? null : renderToStaticMarkup(element)
    }
    expect(await as(world.staff, variance)).toContain('Variance recording certificate')
    expect(await as(world.staff, building)).toBeNull()
    expect(await as(world.reviewer, variance)).toBeNull()
  })

  it('prints the recording certificate on an approved variance and attaches it for the parties', async () => {
    const printed = await printLetter(
      handle.db,
      world.staff,
      { applicationId: variance, templateKey: 'var-recording-certificate' },
      store,
      signal,
    )
    if (!printed.ok) throw new Error(printed.error)
    const [doc] = await handle.db
      .select()
      .from(documents)
      .where(eq(documents.id, printed.value.documentId))
    expect(doc?.recordKind).toBe('application')
    expect(doc?.recordId).toBe(variance)
    expect(doc?.title).toBe('Variance recording certificate')
    expect(doc?.audiences).toEqual(['project_parties'])
    const text = (await pdfText(await downloadObject(handle.db, store, printed.value.documentId)))
      .replace(/\s+/g, ' ')
      .trim()
    expect(text).toContain(OWNER)
    for (const condition of CONDITIONS) expect(text).toContain(condition)
    expect(text).toContain('Book ____, Page ____')
  })

  it('lists no letters for a type that pins none and refuses to print one there', async () => {
    expect(await lettersFor(handle.db, building, signal)).toEqual([])
    expect(
      await printLetter(
        handle.db,
        world.staff,
        { applicationId: building, templateKey: 'var-recording-certificate' },
        store,
        signal,
      ),
    ).toEqual({ ok: false, error: 'unknown_letter' })
  })

  it('refuses a reviewer who cannot add documents to the application', async () => {
    expect(
      await printLetter(
        handle.db,
        world.reviewer,
        { applicationId: variance, templateKey: 'var-recording-certificate' },
        store,
        signal,
      ),
    ).toEqual({ ok: false, error: 'forbidden' })
  })
})
