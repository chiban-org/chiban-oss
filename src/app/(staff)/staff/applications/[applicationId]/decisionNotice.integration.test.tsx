import { eq } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applicationDocumentLinks, applications, clocks, documents } from '@/db/schema'
import { recordDecisionNotice, refuseBySilence } from '@/features/applications/deemedRefusal'
import { STAFF_DECISION_LETTER_TITLE } from '@/features/applications/staffDecision'
import { startClocksFor } from '@/features/clocks/startClocks'
import { setActivePackForTest } from '@/features/packs/registry'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { appTypeBody, saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { sectionOf } from '@/test/htmlSections'
import { XX_PACK } from '@/test/packs/xx'
import { xxPackWith } from '@/test/packs/xx/variants'
import { addDays, type CivilDate } from '@/types/civilDate'

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
const DUE = addDays(STARTED, 21)
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

async function decide(): Promise<void> {
  await handle.db
    .update(applications)
    .set({ state: 'decided' })
    .where(eq(applications.id, applicationId))
}

describe('the written decision notice section', () => {
  it('shows the due date and citation without a form before the decision', async () => {
    await addDocument('Notice of decision letter')
    const section = sectionOf(await page(), LABEL)
    expect(section).toContain(`${LABEL} due March 22, 2099 (Vellmora Permit Act 4).`)
    expect(section).not.toContain('name="documentId"')
  })

  it('shows the due date and citation, and a form listing the documents and a mailed date', async () => {
    await addDocument('Notice of decision letter')
    await decide()
    const section = sectionOf(await page(), LABEL)
    expect(section).toContain(`${LABEL} due March 22, 2099 (Vellmora Permit Act 4).`)
    expect(section).toContain('Notice of decision letter')
    expect(section).toContain('name="documentId"')
    expect(section).toContain('name="mailedOn"')
    expect(section).toContain('type="date"')
    expect(section).toContain('Record the written decision notice')
  })

  it('lists the generated decision letter first and preselects it', async () => {
    await addDocument('Notice of decision letter')
    const letterId = await addDocument(STAFF_DECISION_LETTER_TITLE)
    await decide()
    const section = sectionOf(await page(), LABEL) ?? ''
    const letterAt = section.indexOf(STAFF_DECISION_LETTER_TITLE)
    expect(letterAt).toBeGreaterThan(-1)
    expect(letterAt).toBeLessThan(section.indexOf('Notice of decision letter'))
    expect(section).toContain(`value="${letterId}" selected=""`)
  })

  it('shows the mailed date once the notice is recorded and drops the form', async () => {
    const documentId = await addDocument('Notice of decision letter')
    await decide()
    const recorded = await recordDecisionNotice(
      handle.db,
      world.staff,
      { applicationId, documentId, mailedOn: '2026-03-15' as CivilDate },
      signal,
    )
    expect(recorded.ok).toBe(true)
    const section = sectionOf(await page(), LABEL)
    expect(section).toContain(`${LABEL} mailed on March 15, 2026.`)
    expect(section).not.toContain('name="documentId"')
  })

  it('says the notice is not recorded once the day has passed on a decided application', async () => {
    await decide()
    await handle.db
      .update(clocks)
      .set({ currentDue: '2020-01-10' })
      .where(eq(clocks.applicationId, applicationId))
    const section = sectionOf(await page(), LABEL)
    expect(section).toContain(`${LABEL} was due January 10, 2020 and is not recorded.`)
    expect(section).not.toContain('(Vellmora Permit Act 4)')
  })

  it('shows the refusal by operation of law after the sweep', async () => {
    await handle.db.transaction((tx) => refuseBySilence(tx, addDays(DUE, 1), signal))
    const section = sectionOf(await page(), LABEL)
    expect(section).toContain(
      'Refused by operation of law on March 23, 2099 (Vellmora Permit Act 4).',
    )
    expect(section).not.toContain('name="documentId"')
  })

  it('keeps the form open after a refusal and shows a notice mailed afterwards', async () => {
    await handle.db.transaction((tx) => refuseBySilence(tx, addDays(DUE, 1), signal))
    const documentId = await addDocument('Notice of decision letter')
    const open = sectionOf(await page(), LABEL)
    expect(open).toContain('name="documentId"')
    const recorded = await recordDecisionNotice(
      handle.db,
      world.staff,
      { applicationId, documentId, mailedOn: '2026-03-15' as CivilDate },
      signal,
    )
    expect(recorded.ok).toBe(true)
    const section = sectionOf(await page(), LABEL)
    expect(section).toContain(
      'Refused by operation of law on March 23, 2099 (Vellmora Permit Act 4). Written decision notice mailed to the applicant on March 15, 2026.',
    )
    expect(section).not.toContain('name="documentId"')
  })

  it('does not appear under a pack with no refusal consequence', async () => {
    setActivePackForTest(XX_PACK)
    expect(sectionOf(await page(), LABEL)).toBeNull()
  })
})

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
    const record = async (documentId: string) =>
      await recordDecisionNotice(
        handle.db,
        world.staff,
        { applicationId, documentId, mailedOn: '2026-03-15' as CivilDate },
        signal,
      )
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
