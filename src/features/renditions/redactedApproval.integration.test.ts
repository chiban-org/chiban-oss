import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { documentVersions } from '@/db/schema'
import { attestationHash, submitApplication } from '@/features/applications/submitApplication'
import { approveRendition } from '@/features/renditions/approvals'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { appTypeBody, FORM_BODY, saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeTestStore } from '@/test/objectStore'
import { uploadRedactionFixture } from '@/test/redactionFixtures'
import { approvePublic, redactedVersionOf, STATEMENT } from '@/test/renditionFixtures'

const signal = new AbortController().signal
const ATTESTATION = attestationHash(appTypeBody().attestationText)
let handle: TestDb
let world: PermitWorld
let store: ObjectStore

const FORM_WITH_CONTACT = {
  ...FORM_BODY,
  fields: [
    ...FORM_BODY.fields,
    { key: 'contact_email', label: 'Contact email', type: 'email', required: false },
  ],
}

beforeAll(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db)
  store = (await makeTestStore()).store
  await saveAndPublish(handle.db, world.admin, 'form', 'bp-form', FORM_WITH_CONTACT)
})
afterAll(async () => {
  await handle.drop()
})

async function snapshotPublicCopy(): Promise<string> {
  const app = await makeApplication(handle.db, world)
  const submitted = await submitApplication(
    handle.db,
    world.applicant,
    {
      applicationId: app.applicationId,
      values: { classification: 'residential', contact_email: 'wren@fernhollow.example' },
      attestation: { statementSha256: ATTESTATION },
    },
    signal,
    new Date('2027-03-02T15:00:00Z'),
    store,
  )
  if (!submitted.ok) throw new Error(`submit ${JSON.stringify(submitted.error)}`)
  const [version] = await handle.db
    .select({ id: documentVersions.id, jobId: documentVersions.redactionJobId })
    .from(documentVersions)
    .where(eq(documentVersions.role, 'public_redacted'))
  expect(version?.jobId).toBeNull()
  return version?.id ?? ''
}

const approve = (versionId: string, purpose: 'public' | 'rtk_release') =>
  approveRendition(
    handle.db,
    world.staff,
    { versionId, purpose, reviewStatement: STATEMENT },
    signal,
    store,
  )

describe('approving a redacted copy for a records release', () => {
  it('a public redacted snapshot copy cannot be approved for release, and stays approvable for the public', async () => {
    const versionId = await snapshotPublicCopy()
    expect(await approve(versionId, 'rtk_release')).toEqual({
      ok: false,
      error: 'redaction_not_cited',
    })
    expect(await approvePublic(handle.db, world.staff, versionId, store)).not.toBe('')
  })

  it('a redacted copy drawn in Chiban with its exemptions can be approved for release', async () => {
    const source = await uploadRedactionFixture(handle.db, store, world.staff, 'letter.pdf')
    const versionId = await redactedVersionOf(handle.db, store, world.staff, source, 'rtk_release')
    expect((await approve(versionId, 'rtk_release')).ok).toBe(true)
  })
})
