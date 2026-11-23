import { and, eq, isNull } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applications, documents } from '@/db/schema'
import type { ApplicationTypeBody } from '@/features/applications/applicationTypeSchema'
import { decideStaffApplication } from '@/features/applications/staffDecision'
import type { Actor } from '@/features/auth/actor'
import { getPublished } from '@/features/config/store'
import { setActivePackForTest } from '@/features/packs/registry'
import { buildPermitPdf } from '@/features/permits/permitDocuments'
import type { ObjectStore } from '@/features/storage/objectStore'
import { doc, para, signature } from '@/features/templates/doc/build'
import { documentKind } from '@/features/templates/kinds/documentKinds'
import type { Signer } from '@/features/town/profileSchema'
import { publishTownProfileSection } from '@/features/town/profileSettings'
import { makeApplication } from '@/test/applicationFixtures'
import { saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  INSPECTION_NOW,
  type InspectionWorld,
  setupInspectionWorld,
} from '@/test/inspectionFixtures'
import { downloadObject } from '@/test/objectBytes'
import { makeTestStore } from '@/test/objectStore'
import { pdfWording } from '@/test/pdfWording'
import { staffWith } from '@/test/staffUsers'
import type { CivilDate } from '@/types/civilDate'
import { ME_CLASSIFICATIONS } from './classifications'
import { ME_PACK } from './index'

const signal = new AbortController().signal
const ISSUED = '2027-06-20' as CivilDate
const PLUMBING_SIGNER = 'Lee Piper'
const BUILDING_SIGNER = 'Rowan Ashby'
const CLERK_SIGNER = 'Tamsin Vell'
const REASON = 'The design shows the disposal field inside the setback.'
let handle: TestDb
let w: InspectionWorld
let plumber: Actor
let store: ObjectStore

const BUILDING: Signer = {
  role: 'building_official',
  name: BUILDING_SIGNER,
  title: 'Code Enforcement Officer',
  signature: null,
}
const PLUMBING: Signer = {
  role: 'plumbing_inspector',
  name: PLUMBING_SIGNER,
  title: 'Local Plumbing Inspector',
  signature: null,
}
const CLERK: Signer = {
  role: 'town_clerk',
  name: CLERK_SIGNER,
  title: 'Town Clerk',
  signature: null,
}

async function publishType(
  typeKey: string,
  prefix: string,
  classification: string,
  templates: string[],
) {
  const electrical = await getPublished(handle.db, 'application_type', 'EL', signal)
  const body = electrical?.body as ApplicationTypeBody
  await saveAndPublish(handle.db, w.world.admin, 'application_type', typeKey, {
    ...body,
    key: typeKey,
    label: classification,
    prefix,
    classification,
    bindings: ME_CLASSIFICATIONS.find((c) => c.key === classification)?.mandatoryRuleKeys ?? [],
    templateKeys: templates,
    workflow: { ...body.workflow, allowsDirectIssue: true },
  })
}

async function publishSigners(signers: Signer[]) {
  const published = await publishTownProfileSection(
    handle.db,
    w.world.admin,
    { section: 'signers', slice: { signers } },
    signal,
  )
  if (!published.ok) throw new Error(JSON.stringify(published.error))
}

async function permitText(typeKey: string): Promise<string> {
  const made = await makeApplication(
    handle.db,
    w.world,
    { state: 'issued', issuedOn: ISSUED },
    INSPECTION_NOW,
    typeKey,
  )
  const built = await buildPermitPdf(handle.db, made.applicationId, signal)
  if (!built.ok) throw new Error(built.error)
  return await pdfWording(built.value)
}

async function denialLetterText(typeKey: string): Promise<string> {
  const made = await makeApplication(
    handle.db,
    w.world,
    { state: 'under_review' },
    INSPECTION_NOW,
    typeKey,
  )
  const [row] = await handle.db
    .select({ rowVersion: applications.rowVersion })
    .from(applications)
    .where(eq(applications.id, made.applicationId))
  const decided = await decideStaffApplication(
    handle.db,
    plumber,
    {
      applicationId: made.applicationId,
      outcome: 'denied',
      expectedRowVersion: row?.rowVersion ?? 1,
      reason: REASON,
      decidedOn: ISSUED,
    },
    store,
    signal,
  )
  if (!decided.ok) throw new Error(JSON.stringify(decided.error))
  const [letter] = await handle.db
    .select({ id: documents.id })
    .from(documents)
    .where(
      and(
        eq(documents.recordId, made.applicationId),
        eq(documents.title, documentKind('permit_decision_letter').title),
        isNull(documents.supersededBy),
      ),
    )
  return await pdfWording(await downloadObject(handle.db, store, letter?.id ?? ''))
}

beforeEach(async () => {
  handle = await makeTestDb()
  w = await setupInspectionWorld(handle.db)
  store = (await makeTestStore()).store
  setActivePackForTest(ME_PACK)
  await saveAndPublish(handle.db, w.world.admin, 'template', 'ip-permit', {
    key: 'ip-permit',
    label: 'Internal plumbing permit',
    kind: 'permit',
    format: 'doc',
    doc: doc(
      para('Permit {{application.number}}'),
      signature('building_official'),
      signature('town_clerk'),
    ),
  })
  await publishType('MPL', 'PL', 'me.internal_plumbing', ['ip-permit'])
  await publishType('MSW', 'SW', 'me.subsurface_wastewater', [])
  plumber = await staffWith(handle.db, ['plumbing_inspector'])
})
afterEach(async () => {
  setActivePackForTest(null)
  await handle.drop()
})

describe('the signer on a Maine plumbing permit', () => {
  it('falls back to the building official when the town has no plumbing inspector signer', async () => {
    await publishSigners([BUILDING, CLERK])
    const text = await permitText('MPL')
    expect(text).toContain(BUILDING_SIGNER)
    expect(text).not.toContain('Plumbing inspector signature')
  })

  it('replaces only the default signer and keeps a signature the town added', async () => {
    await publishSigners([BUILDING, PLUMBING, CLERK])
    const text = await permitText('MPL')
    expect(text).toContain(PLUMBING_SIGNER)
    expect(text).toContain(CLERK_SIGNER)
    expect(text).not.toContain(BUILDING_SIGNER)
  })
})

describe('the signer on a Maine plumbing denial letter', () => {
  it('an internal plumbing denial letter is signed by the plumbing inspector', async () => {
    await publishSigners([BUILDING, PLUMBING])
    const text = await denialLetterText('MPL')
    expect(text).toContain(PLUMBING_SIGNER)
    expect(text).not.toContain(BUILDING_SIGNER)
  })

  it('a subsurface wastewater denial letter is signed by the plumbing inspector', async () => {
    await publishSigners([BUILDING, PLUMBING])
    const text = await denialLetterText('MSW')
    expect(text).toContain(PLUMBING_SIGNER)
    expect(text).not.toContain(BUILDING_SIGNER)
  })

  it('a plumbing denial letter falls back to the building official without a plumbing signer', async () => {
    await publishSigners([BUILDING])
    const text = await denialLetterText('MSW')
    expect(text).toContain(BUILDING_SIGNER)
  })
})
