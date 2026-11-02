import { createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applications, attestations } from '@/db/schema'
import {
  amendApplication,
  attestationHash,
  submitApplication,
} from '@/features/applications/submitApplication'
import {
  type ApplicationPatch,
  makeApplication,
  type PermitWorld,
  setupPermitWorld,
} from '@/test/applicationFixtures'
import { appTypeBody, FORM_BODY, saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'

const signal = new AbortController().signal
const ATTESTATION = appTypeBody().attestationText
const HASH = createHash('sha256').update(ATTESTATION).digest('hex')
let handle: TestDb
let world: PermitWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db)
})
afterEach(async () => {
  await handle.drop()
})

async function submit(
  applicationId: string,
  values: Record<string, unknown>,
  hash = HASH,
  now = new Date('2027-03-02T15:00:00Z'),
  actor = world.applicant,
) {
  return await submitApplication(
    handle.db,
    actor,
    { applicationId, values, attestation: { statementSha256: hash } },
    signal,
    now,
  )
}

async function row(applicationId: string) {
  const [r] = await handle.db.select().from(applications).where(eq(applications.id, applicationId))
  return r
}

describe('submitApplication', () => {
  it('attestationHash is the SHA-256 of the pinned statement', () => {
    expect(attestationHash(ATTESTATION)).toBe(HASH)
  })

  it('submit with a wrong attestation hash is attestation_mismatch', async () => {
    const app = await makeApplication(handle.db, world)
    expect(await submit(app.applicationId, { classification: 'residential' }, 'deadbeef')).toEqual({
      ok: false,
      error: 'attestation_mismatch',
    })
    expect((await row(app.applicationId))?.state).toBe('draft')
  })

  it('submit records received_date in town time zone', async () => {
    const app = await makeApplication(handle.db, world)
    const r = await submit(
      app.applicationId,
      { classification: 'residential' },
      HASH,
      new Date('2027-03-02T03:30:00Z'),
    )
    expect(r).toEqual({ ok: true, value: { state: 'submitted' } })
    expect(await row(app.applicationId)).toMatchObject({
      state: 'submitted',
      receivedDate: '2027-03-01',
    })
  })

  it('records the attestation with the statement text and hash', async () => {
    const app = await makeApplication(handle.db, world)
    await submit(app.applicationId, { classification: 'residential' })
    const [att] = await handle.db
      .select()
      .from(attestations)
      .where(eq(attestations.applicationId, app.applicationId))
    expect(att).toMatchObject({
      userId: world.applicant.userId,
      statementText: ATTESTATION,
      statementSha256: HASH,
    })
  })

  it('stores validated values and facts', async () => {
    const app = await makeApplication(handle.db, world)
    await submit(app.applicationId, { classification: 'residential', finished_sq_ft: '250.5' })
    expect(await row(app.applicationId)).toMatchObject({
      values: { classification: 'residential', finished_sq_ft: '250.5' },
      facts: { classification: 'residential', dwellingUnits: null, afterTheFact: false },
    })
  })

  it('returns field errors and leaves the draft untouched', async () => {
    const app = await makeApplication(handle.db, world)
    const r = await submit(app.applicationId, {})
    expect(r).toEqual({
      ok: false,
      error: { fieldErrors: [{ field: 'classification', code: 'required' }] },
    })
    expect((await row(app.applicationId))?.state).toBe('draft')
  })

  it('submit with a hidden required field missing succeeds', async () => {
    await saveAndPublish(handle.db, world.admin, 'form', 'bp-form', {
      ...FORM_BODY,
      fields: [
        ...FORM_BODY.fields,
        {
          key: 'dwelling_units',
          label: 'Dwelling units',
          type: 'integer',
          required: true,
          showIf: { field: 'classification', op: 'equals', value: 'residential' },
        },
      ],
    })
    const app = await makeApplication(handle.db, world)
    expect((await submit(app.applicationId, { classification: 'nonresidential' })).ok).toBe(true)
    const again = await makeApplication(handle.db, world)
    expect((await submit(again.applicationId, { classification: 'residential' })).ok).toBe(false)
  })

  it('a non-party is forbidden and an already submitted application is invalid_transition', async () => {
    const app = await makeApplication(handle.db, world)
    expect(
      await submit(
        app.applicationId,
        { classification: 'residential' },
        HASH,
        undefined,
        world.reviewer,
      ),
    ).toEqual({ ok: false, error: 'forbidden' })
    await submit(app.applicationId, { classification: 'residential' })
    expect(await submit(app.applicationId, { classification: 'residential' })).toEqual({
      ok: false,
      error: 'invalid_transition',
    })
  })

  it('the applicant cannot set the staff-only after-the-fact field', async () => {
    await saveAndPublish(handle.db, world.admin, 'form', 'bp-form', {
      ...FORM_BODY,
      fields: [
        ...FORM_BODY.fields,
        {
          key: 'after_the_fact',
          label: 'After the fact',
          type: 'checkbox',
          required: false,
          fact: 'afterTheFact',
          staffOnly: true,
        },
      ],
    })
    const app = await makeApplication(handle.db, world)
    const r = await submit(app.applicationId, {
      classification: 'residential',
      after_the_fact: true,
    })
    expect(r).toEqual({
      ok: false,
      error: { fieldErrors: [{ field: 'after_the_fact', code: 'staff_only' }] },
    })
  })
})

describe('amendApplication', () => {
  async function inState(state: ApplicationPatch['state']) {
    return await makeApplication(handle.db, world, {
      state,
      values: { classification: 'residential' },
    })
  }

  it('an applicant may amend while submitted', async () => {
    const app = await inState('submitted')
    const r = await amendApplication(
      handle.db,
      world.applicant,
      { applicationId: app.applicationId, values: { classification: 'nonresidential' } },
      signal,
    )
    expect(r.ok).toBe(true)
    expect(await row(app.applicationId)).toMatchObject({
      values: { classification: 'nonresidential' },
      rowVersion: 2,
    })
  })

  it('applicant amend after review starts is forbidden', async () => {
    const app = await inState('under_review')
    const r = await amendApplication(
      handle.db,
      world.applicant,
      { applicationId: app.applicationId, values: { classification: 'nonresidential' } },
      signal,
    )
    expect(r).toEqual({ ok: false, error: 'forbidden' })
  })

  it('staff with application.amend_after_review may amend after review starts; a reviewer may not', async () => {
    const app = await inState('under_review')
    const input = { applicationId: app.applicationId, values: { classification: 'nonresidential' } }
    expect((await amendApplication(handle.db, world.staff, input, signal)).ok).toBe(true)
    expect(await amendApplication(handle.db, world.reviewer, input, signal)).toEqual({
      ok: false,
      error: 'forbidden',
    })
  })

  it('a closed application cannot be amended', async () => {
    const app = await inState('closed')
    const r = await amendApplication(
      handle.db,
      world.staff,
      { applicationId: app.applicationId, values: { classification: 'residential' } },
      signal,
    )
    expect(r).toEqual({ ok: false, error: 'not_amendable' })
  })
})
