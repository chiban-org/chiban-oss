import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openCase, setCaseStatus } from '@/features/enforcement/cases'
import { recordCivilAction } from '@/features/enforcement/civilActions'
import { buildCounselPacket } from '@/features/enforcement/counselPacket'
import {
  applyCureProcedure,
  recordCureReturnReceipt,
  sendCureNotice,
} from '@/features/enforcement/cureNotices'
import { placeDevelopmentHold } from '@/features/enforcement/developmentHolds'
import { recordFinding } from '@/features/enforcement/findings'
import { setActivePackForTest } from '@/features/packs/registry'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeTestStore } from '@/test/objectStore'
import { type EnforcementWorld, setupEnforcementWorld } from '@/test/enforcementFixtures'
import { makeParcel } from '@/test/parcels'
import { pdfWording } from '@/test/pdfWording'
import type { CivilDate } from '@/types/civilDate'
import { ME_PACK } from './index'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
const SENT_NOW = new Date('2027-03-02T15:00:00Z')
const LATER = new Date('2027-04-01T15:00:00Z')
let handle: TestDb
let world: EnforcementWorld

beforeEach(async () => {
  setActivePackForTest(ME_PACK)
  handle = await makeTestDb()
  world = await setupEnforcementWorld(handle.db)
})
afterEach(async () => {
  setActivePackForTest(null)
  await handle.drop()
})

function must<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!result.ok) throw new Error(JSON.stringify(result.error))
  return result.value
}

async function shorelandCaseWithRemedies(): Promise<string> {
  const db = handle.db
  const parcelId = await makeParcel(db, [], { siteAddress: '12 Loon Cove Road' })
  const { caseId } = must(
    await openCase(db, world.staff, { locationText: '12 Loon Cove Road', parcelId }, signal),
  )
  must(
    await setCaseStatus(
      db,
      world.staff,
      { caseId, to: 'investigating', expectedRowVersion: 1 },
      signal,
    ),
  )
  const { findingId } = must(
    await recordFinding(
      db,
      world.staff,
      {
        caseId,
        provisionKind: 'zoning_ordinance',
        provisionRef: 'Shoreland Zoning Ordinance Section 15',
        facts: 'Trees were cut inside the shoreland strip.',
        inspectionDate: '2027-02-20',
      },
      signal,
      SENT_NOW,
    ),
  )
  must(await applyCureProcedure(db, world.staff, { caseId, ruleKey: 'me.enf.cure' }, signal))
  const { ids } = must(
    await sendCureNotice(
      db,
      (await makeTestStore()).store,
      world.staff,
      {
        caseId,
        findingIds: [findingId],
        owner: { name: 'Larkspur Family Trust', mailingAddress: '9 Fern Road, Vellmora' },
        occupant: 'none',
        sentOn: d('2027-03-01'),
      },
      signal,
      SENT_NOW,
    ),
  )
  must(
    await recordCureReturnReceipt(
      db,
      world.staff,
      { cureNoticeId: ids[0] ?? '', receivedOn: d('2027-03-04') },
      signal,
      LATER,
    ),
  )
  must(await placeDevelopmentHold(db, world.staff, { caseId, placedOn: d('2027-03-12') }, signal))
  must(
    await recordCivilAction(
      db,
      world.staff,
      {
        caseId,
        filedOn: d('2027-03-15'),
        court: 'Vellmora District Court',
        docket: 'VD-2027-0042',
      },
      signal,
    ),
  )
  return caseId
}

describe('the Maine counsel packet', () => {
  it('prints the cure notice, the development hold and the civil action', async () => {
    const caseId = await shorelandCaseWithRemedies()
    const bytes = await buildCounselPacket(handle.db, caseId, d('2027-03-20'), LATER, signal)
    const text = (await pdfWording(bytes)).replace(/\s+/g, ' ')
    expect(text).toContain(
      'Cure notice to owner Larkspur Family Trust, March 1, 2027 March 4, 2027',
    )
    expect(text).toContain('Hold placed March 12, 2027')
    expect(text).toContain('Hold released Not released')
    expect(text).toContain('Civil action filed March 15, 2027')
    expect(text).toContain('Court Vellmora District Court')
    expect(text).toContain('Docket VD-2027-0042')
  })
})
