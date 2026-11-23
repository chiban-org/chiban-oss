import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { setActivePackForTest } from '@/features/packs/registry'
import { setDocumentSeries } from '@/features/records/assignments'
import { retentionWorklist, WORKLIST_STATES, type WorklistState } from '@/features/records/worklist'
import { readRetentionView } from '@/features/records/worklistParams'
import { fileRequestLetter } from '@/features/rtk/requestLetter'
import { closeRequest } from '@/features/rtk/requests'
import { setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeTestStore } from '@/test/objectStore'
import { REQUEST_LETTER_SERIES, RETENTION_EVENTS_PACK } from '@/test/packs/retentionEventsPack'
import { staffActor } from '@/test/parcels'
import { loggedRequest } from '@/test/rtkFixtures'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
const CLOSED_AT = new Date('2026-11-10T15:00:00Z')
let handle: TestDb

beforeAll(() => {
  setActivePackForTest(RETENTION_EVENTS_PACK)
})
afterAll(() => {
  setActivePackForTest(null)
})
beforeEach(async () => {
  handle = await makeTestDb()
})
afterEach(async () => {
  await handle.drop()
})

async function requestWithLetter() {
  await setupPermitWorld(handle.db)
  const custodian = await staffActor(handle.db, 'records_custodian')
  const requestId = await loggedRequest(handle.db, custodian)
  const store = (await makeTestStore()).store
  const documentId = await handle.db.transaction((tx) =>
    fileRequestLetter(
      tx,
      { store, actor: custodian, signal },
      { requestId, title: 'Response letter', filename: 'response.pdf' },
    ),
  )
  const series = await setDocumentSeries(
    handle.db,
    custodian,
    { documentId, seriesKey: REQUEST_LETTER_SERIES.key },
    signal,
  )
  if (!series.ok) throw new Error(`series ${series.error}`)
  return { custodian, requestId, documentId }
}

describe('records eligible on a later date', () => {
  it('closing the request moves its letter from waiting for an event to eligible later, with the date', async () => {
    const { custodian, requestId, documentId } = await requestWithLetter()
    const page = async (state: WorklistState, asOf: string) =>
      await retentionWorklist(handle.db, custodian, { asOf: d(asOf), state, limit: 50 }, signal)
    const ids = async (state: WorklistState, asOf: string) =>
      (await page(state, asOf)).rows.map((r) => r.ref.id)
    expect(await ids('awaiting_event', '2026-11-10')).toContain(documentId)
    expect(await ids('scheduled', '2026-11-10')).not.toContain(documentId)
    const closed = await closeRequest(
      handle.db,
      custodian,
      { requestId, to: 'closed', expectedRowVersion: 1 },
      signal,
      CLOSED_AT,
    )
    expect(closed.ok).toBe(true)
    expect(await ids('awaiting_event', '2026-11-10')).not.toContain(documentId)
    expect(await ids('eligible', '2026-11-10')).not.toContain(documentId)
    const later = await page('scheduled', '2026-11-10')
    expect(later.rows.find((r) => r.ref.id === documentId)?.status).toEqual({
      state: 'eligible_on',
      date: '2027-11-10',
    })
    expect(later.counts.get('scheduled')).toBe(later.total)
    expect(await ids('scheduled', '2027-11-10')).not.toContain(documentId)
    expect(await ids('eligible', '2027-11-10')).toContain(documentId)
  })

  it('offers the eligible later list as a fourth retention state', () => {
    expect(WORKLIST_STATES).toEqual(['eligible', 'scheduled', 'awaiting_event', 'on_hold'])
    expect(readRetentionView({ state: 'scheduled' }).state).toBe('scheduled')
  })
})
