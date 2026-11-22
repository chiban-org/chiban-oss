import { ME_PACK } from '@packs/me'
import { NH_PACK } from '@packs/nh'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { EnforcementQueueTable } from '@/components/enforcement/EnforcementQueueTable'
import { perilCertifications, restrainingOrders } from '@/db/schema'
import {
  certifyImminentPeril,
  recordEnforcementAppeal,
  recordRestrainingOrder,
} from '@/features/enforcement/appeals'
import type { CaseSortKey } from '@/features/enforcement/caseListParams'
import type { QueueRow } from '@/features/enforcement/caseQueue'
import { sendViolationNotice } from '@/features/enforcement/notices'
import { setActivePackForTest } from '@/features/packs/registry'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeTestDb, type TestDb } from '@/test/db'
import { caseWithFinding } from '@/test/enforcementActionFixtures'
import {
  type EnforcementWorld,
  FIXTURE_NOW,
  setupEnforcementWorld,
} from '@/test/enforcementFixtures'
import { makeTestStore } from '@/test/objectStore'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
const LATER = new Date('2027-07-20T15:00:00Z')
let handle: TestDb
let store: ObjectStore
let world: EnforcementWorld

beforeEach(async () => {
  setActivePackForTest(ME_PACK)
  handle = await makeTestDb()
  store = (await makeTestStore()).store
  world = await setupEnforcementWorld(handle.db)
})
afterEach(async () => {
  setActivePackForTest(null)
  await handle.drop()
})

async function appealedNotice(): Promise<string> {
  const { caseId, findingId } = await caseWithFinding(handle.db, world, '3 Vellmora Lane')
  const sent = await sendViolationNotice(
    handle.db,
    store,
    world.staff,
    { caseId, findingIds: [findingId], sentOn: '2027-03-01', method: 'certified_mail' },
    signal,
    FIXTURE_NOW,
  )
  if (!sent.ok) throw new Error(sent.error)
  const filed = await recordEnforcementAppeal(
    handle.db,
    world.staff,
    {
      caseId,
      targetKind: 'notice',
      targetId: sent.value.noticeId,
      filedOn: d('2027-03-05'),
      appellantName: 'Pat Owner',
    },
    signal,
    LATER,
  )
  if (!filed.ok) throw new Error(filed.error)
  return filed.value.appealId
}

describe('stay controls under a pack whose appeals do not stay enforcement', () => {
  it('refuses to certify imminent peril and records nothing', async () => {
    const appealId = await appealedNotice()
    const certified = await certifyImminentPeril(
      handle.db,
      world.staff,
      {
        appealId,
        categories: ['safety'],
        statement: 'The retaining wall is leaning over the road.',
        certifiedOn: d('2027-03-06'),
      },
      signal,
    )
    expect(certified).toEqual({ ok: false, error: 'stay_not_applicable' })
    expect(await handle.db.select().from(perilCertifications)).toEqual([])
  })

  it('refuses to record a restraining order and records nothing', async () => {
    const appealId = await appealedNotice()
    const restrained = await recordRestrainingOrder(
      handle.db,
      world.staff,
      {
        appealId,
        issuedBy: 'superior_court',
        issuedOn: d('2027-03-08'),
        documentId: '00000000-0000-4000-8000-000000000009',
      },
      signal,
    )
    expect(restrained).toEqual({ ok: false, error: 'stay_not_applicable' })
    expect(await handle.db.select().from(restrainingOrders)).toEqual([])
  })
})

const SORT_KEYS: CaseSortKey[] = ['number', 'where', 'status', 'opened', 'next', 'stay', 'assigned']

function queueMarkup(): string {
  const links = Object.fromEntries(
    SORT_KEYS.map((k) => [k, { href: `?sort=${k}`, direction: null }]),
  ) as Record<CaseSortKey, { href: string; direction: null }>
  const row = {
    caseId: '00000000-0000-4000-8000-000000000001',
    number: 'EC-2027-0001',
    locationText: '3 Vellmora Lane',
    statusChip: 'neutral',
    statusLabel: 'Under investigation',
    openedOn: '2027-03-01',
    nextStep: null,
    due: null,
    stay: { stayed: false },
    assignedToName: null,
  } as unknown as QueueRow
  return renderToStaticMarkup(createElement(EnforcementQueueTable, { rows: [row], links }))
}

describe('the appeal stay column in the case queue', () => {
  it('is absent where an appeal does not stay enforcement', () => {
    const html = queueMarkup()
    expect(html).not.toContain('Appeal stay')
    expect(html).not.toContain('Not stayed')
  })

  it('stays where an appeal stays enforcement', () => {
    setActivePackForTest(NH_PACK)
    const html = queueMarkup()
    expect(html).toContain('Appeal stay')
    expect(html).toContain('Not stayed')
  })
})
