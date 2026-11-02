import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { env } from '@/config/env'
import { auditLog, complaints, documents, enforcementCases } from '@/db/schema'
import { handleAnonymousIntake } from '@/features/anonymousIntake/handler'
import { getCase } from '@/features/enforcement/access'
import { openCase, setCaseStatus } from '@/features/enforcement/cases'
import { recordFinding } from '@/features/enforcement/findings'
import {
  publishCase,
  setComplaintPublicText,
  unpublishCase,
} from '@/features/enforcement/publicText'
import { getParcelHistory } from '@/features/parcels/parcelHistory'
import type { ObjectStore } from '@/features/storage/objectStore'
import { createRateLimiter } from '@/server/rateLimiter'
import { openAnonymousIntake } from '@/test/anonymousFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeTestStore } from '@/test/minio'
import { makeParcel, seedParcelWorld, staffActor } from '@/test/parcels'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const NOW = new Date('2027-03-02T15:00:00Z')
const d = (s: string) => s as CivilDate
const SECRET = 'My neighbor Pat at 14 Birch Lane built the shed'
let handle: TestDb
let store: ObjectStore

beforeEach(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
  store = (await makeTestStore()).store
  await openAnonymousIntake(handle.db, { imageRef: null, appVersion: '0' })
})
afterEach(async () => {
  await handle.drop()
})

async function anonymousComplaint() {
  const form = new FormData()
  form.append('location', '14 Birch Lane')
  form.append('description', SECRET)
  form.append(
    'photos',
    new File(
      [
        new Uint8Array(
          readFileSync(
            fileURLToPath(new URL('../../test/fixtures/anonymous/gps-artist.jpg', import.meta.url)),
          ),
        ),
      ],
      'a.jpg',
      { type: 'image/jpeg' },
    ),
  )
  const response = await handleAnonymousIntake(
    {
      db: handle.db,
      store,
      now: () => NOW,
      limiter: createRateLimiter({ max: 5, windowMs: 1000 }),
      imageRef: null,
      appVersion: '0',
    },
    new Request(`${new URL(env.BASE_URL).origin}/intake/anonymous`, { method: 'POST', body: form }),
    signal,
  )
  expect(response.status).toBe(303)
  const [row] = await handle.db.select().from(complaints)
  if (row?.caseId === null || row === undefined) throw new Error('no complaint')
  return { complaintId: row.id, caseId: row.caseId }
}

describe('complaint redaction and the public case record', () => {
  it('case with an unreviewed anonymous complaint cannot be published', async () => {
    const staff = await staffActor(handle.db, 'staff')
    const { caseId } = await anonymousComplaint()
    expect(
      await publishCase(handle.db, staff, { caseId, summary: 'Possible unpermitted shed' }, signal),
    ).toEqual({
      ok: false,
      error: 'complaint_text_unreviewed',
    })
    const [row] = await handle.db
      .select()
      .from(enforcementCases)
      .where(eq(enforcementCases.id, caseId))
    expect(row?.isPublic).toBe(false)
  })

  it('public view shows description_public and never description_original', async () => {
    const staff = await staffActor(handle.db, 'staff')
    const { caseId, complaintId } = await anonymousComplaint()
    const set = await setComplaintPublicText(
      handle.db,
      staff,
      { complaintId, text: 'A shed was reported on the property.' },
      signal,
      NOW,
    )
    expect(set.ok).toBe(true)
    expect(
      (
        await publishCase(
          handle.db,
          staff,
          { caseId, summary: 'Possible unpermitted shed' },
          signal,
        )
      ).ok,
    ).toBe(true)
    const view = await getCase(handle.db, null, caseId, signal)
    if (!view.ok || view.value.kind !== 'public') throw new Error('view')
    expect(view.value.approvedComplaintText).toEqual(['A shed was reported on the property.'])
    expect(JSON.stringify(view)).not.toContain('Pat')
    expect(JSON.stringify(view)).not.toContain(SECRET)
  })

  it('audit of public text stores a hash, not the text', async () => {
    const staff = await staffActor(handle.db, 'staff')
    const { complaintId } = await anonymousComplaint()
    const text = 'A shed was reported on the property.'
    await setComplaintPublicText(handle.db, staff, { complaintId, text }, signal, NOW)
    const audit = await handle.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, 'enforcement.public_text_set'))
    expect(audit).toHaveLength(1)
    const serialized = JSON.stringify(audit[0]?.after)
    expect(serialized).toContain(createHash('sha256').update(text).digest('hex'))
    expect(serialized).not.toContain('shed')
  })

  it('unpublishing a case hides it from the parcel page immediately', async () => {
    const staff = await staffActor(handle.db, 'staff')
    const parcelId = await makeParcel(handle.db, [{ format: 'gis12', value: '007001000000' }])
    const opened = await openCase(
      handle.db,
      staff,
      { locationText: '14 Birch Lane', parcelId },
      signal,
      NOW,
    )
    if (!opened.ok) throw new Error('open')
    const { caseId, number } = opened.value
    expect(
      (await publishCase(handle.db, staff, { caseId, summary: 'Open violation' }, signal)).ok,
    ).toBe(true)
    const seen = await getParcelHistory(handle.db, parcelId, { kind: 'public' }, signal)
    expect(seen.own.map((r) => r.number)).toContain(number)
    expect((await unpublishCase(handle.db, staff, { caseId }, signal)).ok).toBe(true)
    const hidden = await getParcelHistory(handle.db, parcelId, { kind: 'public' }, signal)
    expect(hidden.own.map((r) => r.number)).not.toContain(number)
  })

  it('the public view carries provisions and issued order numbers but no facts', async () => {
    const staff = await staffActor(handle.db, 'staff')
    const opened = await openCase(handle.db, staff, { locationText: '14 Birch Lane' }, signal, NOW)
    if (!opened.ok) throw new Error('open')
    const { caseId } = opened.value
    await setCaseStatus(
      handle.db,
      staff,
      { caseId, to: 'investigating', expectedRowVersion: 1 },
      signal,
    )
    await recordFinding(
      handle.db,
      staff,
      {
        caseId,
        provisionKind: 'zoning_ordinance',
        provisionRef: 'Section 4.2',
        facts: 'FACTS-STAY-PRIVATE',
        inspectionDate: d('2027-02-26'),
      },
      signal,
      NOW,
    )
    await publishCase(handle.db, staff, { caseId, summary: 'Open violation' }, signal)
    const view = await getCase(handle.db, null, caseId, signal)
    if (!view.ok || view.value.kind !== 'public') throw new Error('view')
    expect(view.value.provisions).toEqual(['Zoning ordinance: Section 4.2'])
    expect(view.value.orders).toEqual([])
    expect(JSON.stringify(view)).not.toContain('FACTS-STAY-PRIVATE')
  })

  it('anonymous photos stay private after the case is published', async () => {
    const staff = await staffActor(handle.db, 'staff')
    const { caseId, complaintId } = await anonymousComplaint()
    await setComplaintPublicText(
      handle.db,
      staff,
      { complaintId, text: 'A shed was reported.' },
      signal,
      NOW,
    )
    await publishCase(handle.db, staff, { caseId, summary: 'Possible unpermitted shed' }, signal)
    const docs = await handle.db.select().from(documents)
    expect(docs.map((x) => x.isPublic)).toEqual([false])
  })

  it('empty text and an empty summary are refused', async () => {
    const staff = await staffActor(handle.db, 'staff')
    const { caseId, complaintId } = await anonymousComplaint()
    expect(
      await setComplaintPublicText(handle.db, staff, { complaintId, text: '  ' }, signal),
    ).toEqual({
      ok: false,
      error: 'empty',
    })
    expect(await publishCase(handle.db, staff, { caseId, summary: ' ' }, signal)).toEqual({
      ok: false,
      error: 'empty',
    })
  })

  it('a reviewer cannot set public text or publish', async () => {
    const reviewer = await staffActor(handle.db, 'reviewer')
    const { caseId, complaintId } = await anonymousComplaint()
    expect(
      await setComplaintPublicText(handle.db, reviewer, { complaintId, text: 'x' }, signal),
    ).toEqual({
      ok: false,
      error: 'forbidden',
    })
    expect(await publishCase(handle.db, reviewer, { caseId, summary: 'x' }, signal)).toEqual({
      ok: false,
      error: 'forbidden',
    })
  })
})
