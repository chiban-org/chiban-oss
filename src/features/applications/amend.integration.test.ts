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

  async function formWithStaffOnlyField() {
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
  }

  it('an applicant amending ordinary fields keeps the staff-only values and facts', async () => {
    await formWithStaffOnlyField()
    const app = await makeApplication(handle.db, world, {
      state: 'submitted',
      values: { classification: 'residential', after_the_fact: true },
      facts: { classification: 'residential', dwellingUnits: null, afterTheFact: true },
    })
    const r = await amendApplication(
      handle.db,
      world.applicant,
      { applicationId: app.applicationId, values: { classification: 'nonresidential' } },
      signal,
    )
    expect(r.ok).toBe(true)
    expect(await row(app.applicationId)).toMatchObject({
      values: { classification: 'nonresidential', after_the_fact: true },
      facts: { classification: 'nonresidential', afterTheFact: true },
    })
  })

  it('staff amending can change the staff-only value', async () => {
    await formWithStaffOnlyField()
    const app = await makeApplication(handle.db, world, {
      state: 'submitted',
      values: { classification: 'residential', after_the_fact: true },
      facts: { classification: 'residential', dwellingUnits: null, afterTheFact: true },
    })
    await amendApplication(
      handle.db,
      world.staff,
      { applicationId: app.applicationId, values: { classification: 'residential' } },
      signal,
    )
    expect(await row(app.applicationId)).toMatchObject({ facts: { afterTheFact: false } })
  })

  it('an amendment that waited on the application lock is rechecked after staff start review', async () => {
    const app = await makeApplication(handle.db, world, {
      state: 'submitted',
      values: { classification: 'residential' },
    })
    let locked: () => void = () => undefined
    let release: () => void = () => undefined
    const lockTaken = new Promise<void>((resolve) => {
      locked = resolve
    })
    const mayCommit = new Promise<void>((resolve) => {
      release = resolve
    })
    const staffMove = handle.db.transaction(async (tx) => {
      await tx
        .select()
        .from(applications)
        .where(eq(applications.id, app.applicationId))
        .for('update')
      locked()
      await mayCommit
      await tx
        .update(applications)
        .set({ state: 'under_review', rowVersion: 2 })
        .where(eq(applications.id, app.applicationId))
    })
    await lockTaken
    const amend = amendApplication(
      handle.db,
      world.applicant,
      { applicationId: app.applicationId, values: { classification: 'nonresidential' } },
      signal,
    )
    await new Promise((resolve) => setTimeout(resolve, 150))
    release()
    await staffMove
    expect(await amend).toEqual({ ok: false, error: 'forbidden' })
    expect(await row(app.applicationId)).toMatchObject({
      state: 'under_review',
      rowVersion: 2,
      values: { classification: 'residential' },
    })
  })
})

describe('submission and staff-only values', () => {
  it('submitting keeps the staff-only values staff set on the draft', async () => {
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
    const app = await makeApplication(handle.db, world, {
      values: { after_the_fact: true },
      facts: { classification: null, dwellingUnits: null, afterTheFact: true },
    })
    expect((await submit(app.applicationId, { classification: 'residential' })).ok).toBe(true)
    const [row] = await handle.db
      .select()
      .from(applications)
      .where(eq(applications.id, app.applicationId))
    expect(row).toMatchObject({
      values: { classification: 'residential', after_the_fact: true },
      facts: { classification: 'residential', afterTheFact: true },
    })
  })
})
