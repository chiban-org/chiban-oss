import { and, desc, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { auditLog, roleCapabilities } from '@/db/schema'
import { recentApplicationActivity } from '@/features/applications/activity'
import { loadAmendForm } from '@/features/applications/amendForm'
import { amendApplication } from '@/features/applications/submitApplication'
import {
  type ApplicationPatch,
  makeApplication,
  type PermitWorld,
  setupPermitWorld,
} from '@/test/applicationFixtures'
import { FORM_BODY, saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'

const signal = new AbortController().signal
let handle: TestDb
let world: PermitWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db)
})
afterEach(async () => {
  await handle.drop()
})

async function inState(state: ApplicationPatch['state']) {
  return await makeApplication(handle.db, world, {
    state,
    values: { classification: 'residential', finished_sq_ft: '400' },
  })
}

describe('loadAmendForm', () => {
  it('offers staff the current answers on a submitted or under-review application', async () => {
    for (const state of ['submitted', 'under_review'] as const) {
      const app = await inState(state)
      const data = await loadAmendForm(handle.db, world.staff, app.applicationId, signal)
      expect(data).toMatchObject({
        applicationId: app.applicationId,
        values: { classification: 'residential', finished_sq_ft: '400' },
      })
      expect(data?.form.fields.map((f) => f.key)).toEqual(['classification', 'finished_sq_ft'])
    }
  })

  it('offers nothing on a draft, decided, issued or closed application', async () => {
    for (const state of ['draft', 'decided', 'issued', 'closed'] as const) {
      const app = await inState(state)
      expect(await loadAmendForm(handle.db, world.staff, app.applicationId, signal)).toBeNull()
    }
  })

  it('offers nothing to a reviewer or an applicant', async () => {
    const app = await inState('submitted')
    expect(await loadAmendForm(handle.db, world.reviewer, app.applicationId, signal)).toBeNull()
    expect(await loadAmendForm(handle.db, world.applicant, app.applicationId, signal)).toBeNull()
  })

  it('offers nothing under review to staff without the amend after review permission', async () => {
    await handle.db
      .delete(roleCapabilities)
      .where(
        and(
          eq(roleCapabilities.role, 'staff'),
          eq(roleCapabilities.capability, 'application.amend_after_review'),
        ),
      )
    const reviewing = await inState('under_review')
    const submitted = await inState('submitted')
    expect(await loadAmendForm(handle.db, world.staff, reviewing.applicationId, signal)).toBeNull()
    expect(await loadAmendForm(handle.db, world.staff, submitted.applicationId, signal)).not.toBe(
      null,
    )
  })

  it('includes staff-only questions so saving keeps their answers', async () => {
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
      state: 'under_review',
      values: { classification: 'residential', after_the_fact: true },
    })
    const data = await loadAmendForm(handle.db, world.staff, app.applicationId, signal)
    expect(data?.form.fields.map((f) => f.key)).toContain('after_the_fact')
    expect(data?.values).toMatchObject({ after_the_fact: true })
  })
})

describe('amendment history', () => {
  it('records which answers changed and shows them in the recent activity', async () => {
    const app = await inState('under_review')
    const r = await amendApplication(
      handle.db,
      world.staff,
      {
        applicationId: app.applicationId,
        values: { classification: 'nonresidential', finished_sq_ft: '400' },
      },
      signal,
    )
    expect(r.ok).toBe(true)
    const [entry] = await handle.db
      .select({ after: auditLog.after })
      .from(auditLog)
      .where(
        and(eq(auditLog.action, 'application.amend'), eq(auditLog.entityId, app.applicationId)),
      )
      .orderBy(desc(auditLog.at))
    expect(entry?.after).toMatchObject({
      changes: [{ label: 'Classification', from: 'Residential', to: 'Nonresidential' }],
    })
    const activity = await recentApplicationActivity(
      handle.db,
      world.staff,
      app.applicationId,
      signal,
    )
    expect(activity.map((a) => a.what)).toContain(
      'Amended the application: Classification from Residential to Nonresidential',
    )
  })
})
