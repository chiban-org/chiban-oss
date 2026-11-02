import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { migrationBatches, migrationItems } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { makeTestDb, type TestDb } from '@/test/db'
import { importerActor } from '@/test/migrationFixtures'
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
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
vi.mock('./actions', () => ({
  publishMigrationBatchAction: () => Promise.resolve({ ok: true, message: '' }),
}))

const { default: ListPage } = await import('./page')
const { default: BatchPage } = await import('./[batchId]/page')

let handle: TestDb
let importer: Actor
let publisher: Actor
let reviewer: Actor
let batchId: string

const REPORT = {
  source: 6,
  imported: 3,
  duplicateLinked: 1,
  excepted: 1,
  skipped: 1,
  ocrFailed: 1,
  unresolvedParcel: 1,
  exceptionsByReason: { unparseable_folder: 1 },
}

const params = (id: string) => ({ params: Promise.resolve({ batchId: id }) })

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  await seedParcelWorld(handle.db)
  importer = await importerActor(handle.db)
  publisher = await staffActor(handle.db, 'staff')
  reviewer = await staffActor(handle.db, 'reviewer')
  const [batch] = await handle.db
    .insert(migrationBatches)
    .values({
      name: 'Town Hall basement scans',
      sourceRoot: '/srv/legacy',
      seriesKey: 'nh.rs.correspondence_administrative',
      folderPattern: '^Map (?<map>\\d+)',
      idFormat: 'cama15',
      status: 'staged',
      report: REPORT,
      createdBy: publisher.userId,
      createdAt: new Date('2026-11-02T03:30:00Z'),
    })
    .returning({ id: migrationBatches.id })
  batchId = batch?.id ?? ''
  await handle.db.insert(migrationItems).values([
    {
      batchId,
      sourcePath: 'Misc/notes.pdf',
      sizeBytes: 10,
      sha256: 'a',
      outcome: 'excepted',
      exceptReason: 'unparseable_folder',
    },
    {
      batchId,
      sourcePath: 'Map 7/Lot 15/locked.pdf',
      sizeBytes: 10,
      sha256: 'b',
      outcome: 'imported',
      ocrStatus: 'failed',
      ocrReason: 'encrypted',
    },
    {
      batchId,
      sourcePath: 'Map 9/Lot 99/deed.pdf',
      sizeBytes: 10,
      sha256: 'c',
      outcome: 'imported',
      parcelLink: 'unresolved',
    },
  ])
})

afterAll(async () => {
  await handle.drop()
})

describe('migration list page', () => {
  it('lists batches with the created date in long form in the town time zone', async () => {
    state.actor = importer
    const html = renderToStaticMarkup(await ListPage())
    expect(html).toContain('Town Hall basement scans')
    expect(html).toContain('November 1, 2026')
    expect(html).toContain(`/staff/admin/migration/${batchId}`)
  })

  it('refuses a reviewer and redirects a signed-out visitor', async () => {
    state.actor = reviewer
    expect(renderToStaticMarkup(await ListPage())).toContain('You do not have permission')
    state.actor = null
    await expect(ListPage()).rejects.toThrow('NEXT_REDIRECT:/staff/sign-in')
  })
})

describe('migration batch page', () => {
  it('shows the reconciled report, exceptions by reason, and each exception', async () => {
    state.actor = importer
    const html = renderToStaticMarkup(await BatchPage(params(batchId)))
    expect(html).toContain('Source files')
    expect(html).toContain('Imported')
    expect(html).toContain('Duplicates linked')
    expect(html).toContain('OCR failed')
    expect(html).toContain('Parcel not found')
    expect(html).toContain('The folder name did not match the pattern')
    expect(html).toContain('Misc/notes.pdf')
    expect(html).toContain('Map 7/Lot 15/locked.pdf')
    expect(html).toContain('Map 9/Lot 99/deed.pdf')
    expect(html).not.toContain('Publish this batch')
  })

  it('offers the publish action only to someone who may publish', async () => {
    state.actor = publisher
    const html = renderToStaticMarkup(await BatchPage(params(batchId)))
    expect(html).toContain('Publish this batch')
  })

  it('refuses a reviewer, redirects a signed-out visitor, and 404s an unknown batch', async () => {
    state.actor = reviewer
    expect(renderToStaticMarkup(await BatchPage(params(batchId)))).toContain(
      'You do not have permission',
    )
    state.actor = null
    await expect(BatchPage(params(batchId))).rejects.toThrow('NEXT_REDIRECT:/staff/sign-in')
    state.actor = importer
    await expect(BatchPage(params('00000000-0000-4000-8000-000000000000'))).rejects.toThrow(
      'NEXT_NOT_FOUND',
    )
    await expect(BatchPage(params('not-a-uuid'))).rejects.toThrow('NEXT_NOT_FOUND')
  })
})
