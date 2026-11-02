import { randomUUID } from 'node:crypto'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { documents } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { linkRecordByRawRef } from '@/features/parcels/recordLinks'
import { makeTestDb, type TestDb } from '@/test/db'
import { findRawKeys, findUuids } from '@/test/leaks'
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
vi.mock('../[parcelId]/actions', () => ({
  resolveUnresolvedAction: () => Promise.resolve({ ok: true, message: '' }),
}))

const { default: UnresolvedPage } = await import('./page')

const signal = new AbortController().signal
let handle: TestDb

function textOf(html: string): string {
  return html.replace(/<[^>]+>/g, ' ')
}

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  await seedParcelWorld(handle.db)
  state.actor = await staffActor(handle.db, 'staff')
  const [doc] = await handle.db
    .insert(documents)
    .values({
      recordKind: 'parcel',
      recordId: randomUUID(),
      title: 'Deed for Map 9 Lot 99',
      docKind: 'parcel_file',
      createdByKind: 'system',
    })
    .returning({ id: documents.id })
  await handle.db.transaction(async (tx) => {
    await linkRecordByRawRef(
      tx,
      {
        recordKind: 'document',
        recordId: doc?.id ?? '',
        format: 'cama15',
        value: '009099000000000',
      },
      signal,
    )
    await linkRecordByRawRef(
      tx,
      { recordKind: 'demo_record', recordId: randomUUID(), format: 'gis12', value: '008099000000' },
      signal,
    )
  })
})
afterAll(async () => {
  await handle.drop()
})

describe('unresolved records page', () => {
  it('names each record and parcel ID format in words', async () => {
    const text = textOf(renderToStaticMarkup(await UnresolvedPage()))
    expect(text).toContain('Deed for Map 9 Lot 99')
    expect(text).toContain('Named parcel: 009099000000000 (CAMA number)')
    expect(text).toContain('Named parcel: 008099000000 (Map-lot ID)')
    expect(text).toContain('Demo record')
  })

  it('shows no record IDs or internal keys', async () => {
    const text = textOf(renderToStaticMarkup(await UnresolvedPage()))
    expect(findUuids(text)).toEqual([])
    expect(findRawKeys(text, ['document', 'demo_record', 'cama15', 'gis12'])).toEqual([])
  })
})
