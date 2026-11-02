import { createHash } from 'node:crypto'
import { NH_STARTERS } from '@packs/nh/starters'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applications, attestations, feeAssessments } from '@/db/schema'
import {
  amendApplication,
  attestationHash,
  submitApplication,
} from '@/features/applications/submitApplication'
import { adoptStarter } from '@/features/config/adoptStarter'
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

describe('submission side effects', () => {
  it('submitting a trade permit assesses the intake fee', async () => {
    await adoptStarter(handle.db, world.admin, 'nh.starter.electrical', signal)
    const app = await makeApplication(handle.db, world, {}, undefined, 'EL')
    const type = NH_STARTERS.find((s) => s.id === 'nh.starter.electrical')
    const hash = createHash('sha256')
      .update(type?.applicationType.attestationText ?? '')
      .digest('hex')
    const r = await submit(
      app.applicationId,
      { description: 'Panel upgrade', contractor_license_number: 'EL-1' },
      hash,
    )
    expect(r.ok).toBe(true)
    const fees = await handle.db
      .select()
      .from(feeAssessments)
      .where(eq(feeAssessments.applicationId, app.applicationId))
    expect(fees).toMatchObject([{ stage: 'at_intake', totalCents: 4500 }])
  })
})
