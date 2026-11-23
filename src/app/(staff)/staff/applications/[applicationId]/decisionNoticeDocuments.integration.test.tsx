import { eq } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applicationDocumentLinks, applications, documents, users } from '@/db/schema'
import { recordDecisionNotice } from '@/features/applications/deemedRefusal'
import { STAFF_DECISION_LETTER_TITLE } from '@/features/applications/staffDecision'
import { startClocksFor } from '@/features/clocks/startClocks'
import { setActivePackForTest } from '@/features/packs/registry'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { appTypeBody, saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { sectionOf } from '@/test/htmlSections'
import { XX_PACK } from '@/test/packs/xx'
import { xxPackWith } from '@/test/packs/xx/variants'
import type { CivilDate } from '@/types/civilDate'

const state = vi.hoisted((): { db: unknown; actor: unknown } => ({ db: null, actor: null }))

vi.mock('@/db/client', () => ({
  get db() {
    return state.db
  },
}))
vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ get: () => undefined }),
  headers: () => Promise.resolve(new Headers()),
}))
vi.mock('@/server/getActor', () => ({ getActor: () => Promise.resolve(state.actor) }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  notFound: () => {
    throw new Error('NOT_FOUND')
  },
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  },
}))

const { default: ApplicationPage } = await import(
  '@/app/(staff)/staff/applications/[applicationId]/page'
)

const signal = new AbortController().signal
const RULE = 'xx.bp.decision'
const STARTED = '2099-03-01' as CivilDate
const LABEL = 'Written decision notice'

const refusingRules = XX_PACK.manifest.rules.map((r) =>
  r.key === RULE && r.kind === 'clock'
    ? {
        ...r,
        consequence: {
          kind: 'deemed_refused' as const,
          text: 'Failure to decide within the period is a refusal.',
        },
      }
    : r,
)
const refusingPack = xxPackWith({
  manifest: { rules: refusingRules },
  pack: { ruleAreas: [{ title: 'All rules', rules: refusingRules }] },
})

let handle: TestDb
let world: PermitWorld
let applicationId: string

beforeEach(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  world = await setupPermitWorld(handle.db)
  setActivePackForTest(refusingPack)
  await saveAndPublish(
    handle.db,
    world.admin,
    'application_type',
    'BPX',
    appTypeBody({
      key: 'BPX',
      prefix: 'BX',
      classification: 'xx.building_permit',
      bindings: [RULE],
    }),
  )
  const app = await makeApplication(handle.db, world, { state: 'under_review' }, new Date(), 'BPX')
  applicationId = app.applicationId
  await handle.db.transaction((tx) =>
    startClocksFor(tx, applicationId, 'application_completed', STARTED, signal),
  )
})
afterEach(async () => {
  setActivePackForTest(null)
  await handle.drop()
})

async function page(): Promise<string> {
  state.actor = world.staff
  return renderToStaticMarkup(
    (await ApplicationPage({ params: Promise.resolve({ applicationId }) })) as never,
  )
}

async function addDocument(
  title: string,
  docKind: (typeof documents.$inferInsert)['docKind'] = 'attachment',
): Promise<string> {
  const [doc] = await handle.db
    .insert(documents)
    .values({
      recordKind: 'application',
      recordId: applicationId,
      title,
      docKind,
      createdByKind: 'system',
    })
    .returning({ id: documents.id })
  return doc?.id ?? ''
}

async function record(documentId: string) {
  return await recordDecisionNotice(
    handle.db,
    world.staff,
    { applicationId, documentId, mailedOn: '2026-03-15' as CivilDate },
    signal,
  )
}

async function decide(): Promise<void> {
  await handle.db
    .update(applications)
    .set({ state: 'decided' })
    .where(eq(applications.id, applicationId))
}

describe('the documents offered as the written decision notice', () => {
  async function filedOnChecklist(title: string): Promise<string> {
    const documentId = await addDocument(title)
    await handle.db
      .insert(applicationDocumentLinks)
      .values({ applicationId, itemKey: 'site_plan', documentId, linkedBy: world.staff.userId })
    return documentId
  }

  it('offers the decision letter and decision documents, not the snapshot, permit or filed plans', async () => {
    await addDocument(STAFF_DECISION_LETTER_TITLE)
    await addDocument('Board decision on the appeal', 'board_material')
    await addDocument('Signed decision from the counter')
    await addDocument('Application snapshot', 'application_snapshot')
    await addDocument('Issued permit', 'issued_permit')
    await filedOnChecklist('Site plan from the applicant')
    await decide()
    const section = sectionOf(await page(), LABEL) ?? ''
    expect(section).toContain(STAFF_DECISION_LETTER_TITLE)
    expect(section).toContain('Board decision on the appeal')
    expect(section).toContain('Signed decision from the counter')
    expect(section).not.toContain('Application snapshot')
    expect(section).not.toContain('Issued permit')
    expect(section).not.toContain('Site plan from the applicant')
  })

  it('refuses to record the snapshot or a filed plan as the notice', async () => {
    await decide()
    expect(await record(await addDocument('Application snapshot', 'application_snapshot'))).toEqual(
      { ok: false, error: 'not_a_decision_document' },
    )
    expect(await record(await filedOnChecklist('Site plan from the applicant'))).toEqual({
      ok: false,
      error: 'not_a_decision_document',
    })
    expect(
      (await record(await addDocument('Board decision on the appeal', 'board_material'))).ok,
    ).toBe(true)
  })
})

describe('an applicant upload outside the checklist', () => {
  async function uploadedBy(
    title: string,
    creator: { kind: 'user'; userId: string } | { kind: 'anonymous_public_intake' },
  ): Promise<string> {
    const [doc] = await handle.db
      .insert(documents)
      .values({
        recordKind: 'application',
        recordId: applicationId,
        title,
        docKind: 'attachment',
        createdByKind: creator.kind,
        createdBy: creator.kind === 'user' ? creator.userId : null,
      })
      .returning({ id: documents.id })
    return doc?.id ?? ''
  }

  it('is neither offered nor accepted as the written decision notice', async () => {
    const [person] = await handle.db
      .insert(users)
      .values({
        email: 'wren.halloway@fernhollow.example',
        displayName: 'Wren Halloway',
        kind: 'public',
      })
      .returning({ id: users.id })
    const applicantUpload = await uploadedBy('Other document from the applicant', {
      kind: 'user',
      userId: person?.id ?? '',
    })
    const intakeUpload = await uploadedBy('Photo from public intake', {
      kind: 'anonymous_public_intake',
    })
    const staffUpload = await uploadedBy('Decision signed at the counter', {
      kind: 'user',
      userId: world.staff.userId,
    })
    await decide()
    const section = sectionOf(await page(), LABEL) ?? ''
    expect(section).not.toContain('Other document from the applicant')
    expect(section).not.toContain('Photo from public intake')
    expect(section).toContain('Decision signed at the counter')
    expect(await record(applicantUpload)).toEqual({ ok: false, error: 'not_a_decision_document' })
    expect(await record(intakeUpload)).toEqual({ ok: false, error: 'not_a_decision_document' })
    expect((await record(staffUpload)).ok).toBe(true)
  })
})
