import { and, eq, isNull } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { clocks, codeEditionRecords, inspections } from '@/db/schema'
import type { ApplicationTypeBody } from '@/features/applications/applicationTypeSchema'
import type { Actor } from '@/features/auth/actor'
import { startClocksFor } from '@/features/clocks/startClocks'
import { getPublished } from '@/features/config/store'
import { recordInspectionResult } from '@/features/inspections/recordResult'
import { setActivePackForTest } from '@/features/packs/registry'
import { buildPermitPdf } from '@/features/permits/permitDocuments'
import { publishTownProfileSection } from '@/features/town/profileSettings'
import { formatCivilDate } from '@/lib/formatDate'
import { makeApplication } from '@/test/applicationFixtures'
import { saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  INSPECTION_NOW,
  type InspectionWorld,
  passingItems,
  RESULT_NOW,
  scheduledInspection,
  setupInspectionWorld,
} from '@/test/inspectionFixtures'
import { pdfWording } from '@/test/pdfWording'
import { staffWith } from '@/test/staffUsers'
import type { CivilDate } from '@/types/civilDate'
import { ME_CLASSIFICATIONS } from './classifications'
import { ME_2021_EDITION_KEY, ME_CODE_EDITIONS } from './codeEditions'
import { ME_PACK } from './index'

const signal = new AbortController().signal
const ISSUED = '2027-06-20' as CivilDate
const PLUMBING_TYPE = 'MPL'
const SHORELAND_TYPE = 'MSZ'
const BUILDING_TYPE = 'MBP'
const PLUMBING_SIGNER = 'Lee Piper'
const BUILDING_SIGNER = 'Rowan Ashby'
let handle: TestDb
let w: InspectionWorld
let plumber: Actor

function bindingsOf(classification: string): string[] {
  return ME_CLASSIFICATIONS.find((c) => c.key === classification)?.mandatoryRuleKeys ?? []
}

async function publishType(typeKey: string, prefix: string, classification: string) {
  const electrical = await getPublished(handle.db, 'application_type', 'EL', signal)
  const body = electrical?.body as ApplicationTypeBody
  await saveAndPublish(handle.db, w.world.admin, 'application_type', typeKey, {
    ...body,
    key: typeKey,
    label: classification,
    prefix,
    classification,
    bindings: bindingsOf(classification),
    workflow: { ...body.workflow, allowsDirectIssue: true },
  })
}

async function publishSigners() {
  const published = await publishTownProfileSection(
    handle.db,
    w.world.admin,
    {
      section: 'signers',
      slice: {
        signers: [
          {
            role: 'building_official',
            name: BUILDING_SIGNER,
            title: 'Code Enforcement Officer',
            signature: null,
          },
          {
            role: 'plumbing_inspector',
            name: PLUMBING_SIGNER,
            title: 'Local Plumbing Inspector',
            signature: null,
          },
        ],
      },
    },
    signal,
  )
  if (!published.ok) throw new Error(JSON.stringify(published.error))
}

async function issued(typeKey: string): Promise<string> {
  const made = await makeApplication(
    handle.db,
    w.world,
    { state: 'issued', issuedOn: ISSUED },
    INSPECTION_NOW,
    typeKey,
  )
  await handle.db.transaction((tx) =>
    startClocksFor(tx, made.applicationId, 'permit_issued', ISSUED, signal),
  )
  return made.applicationId
}

async function permitText(applicationId: string): Promise<string> {
  const built = await buildPermitPdf(handle.db, applicationId, signal)
  if (!built.ok) throw new Error(built.error)
  return await pdfWording(built.value)
}

async function dueOf(applicationId: string, ruleKey: string): Promise<string> {
  const [clock] = await handle.db
    .select({ due: clocks.currentDue })
    .from(clocks)
    .where(
      and(
        eq(clocks.applicationId, applicationId),
        eq(clocks.ruleKey, ruleKey),
        isNull(clocks.supersededBy),
      ),
    )
  if (clock === undefined) throw new Error(`no ${ruleKey} clock`)
  return formatCivilDate(clock.due)
}

function expiresLine(text: string): string {
  const lines = text.split('\n')
  return lines[lines.indexOf('Expires') + 1] ?? ''
}

async function recordStartOfWork(applicationId: string) {
  const id = await scheduledInspection(handle.db, plumber, applicationId, 'rough')
  const [row] = await handle.db.select().from(inspections).where(eq(inspections.id, id))
  const recorded = await recordInspectionResult(
    handle.db,
    plumber,
    {
      inspectionId: id,
      expectedRowVersion: row?.rowVersion ?? 0,
      result: 'passed',
      items: await passingItems(handle.db, applicationId, 'rough'),
    },
    signal,
    { now: RESULT_NOW },
  )
  expect(recorded.ok).toBe(true)
}

beforeAll(async () => {
  handle = await makeTestDb()
  w = await setupInspectionWorld(handle.db)
  setActivePackForTest(ME_PACK)
  await publishType(PLUMBING_TYPE, 'PL', 'me.internal_plumbing')
  await publishType(SHORELAND_TYPE, 'SZ', 'me.shoreland_permit')
  await publishType(BUILDING_TYPE, 'BP', 'me.building_permit')
  await publishSigners()
  plumber = await staffWith(handle.db, ['plumbing_inspector'])
})
afterAll(async () => {
  setActivePackForTest(null)
  await handle.drop()
})

describe('the expiry date a Maine permit prints', () => {
  it('an internal plumbing permit prints its 24 month date', async () => {
    const applicationId = await issued(PLUMBING_TYPE)
    const due = await dueOf(applicationId, 'me.plumbing.validity')
    const text = await permitText(applicationId)
    expect(expiresLine(text)).toBe(due)
    expect(text).not.toContain('Not applicable')
  })

  it('a shoreland permit prints its expiry date', async () => {
    const applicationId = await issued(SHORELAND_TYPE)
    const due = await dueOf(applicationId, 'town.slz.expiration')
    const text = await permitText(applicationId)
    expect(expiresLine(text)).toBe(due)
    expect(text).not.toContain('Not applicable')
  })

  it('a reprint after a passed start of work inspection still prints the date', async () => {
    const applicationId = await issued(PLUMBING_TYPE)
    const due = await dueOf(applicationId, 'me.plumbing.validity')
    await recordStartOfWork(applicationId)
    expect(expiresLine(await permitText(applicationId))).toBe(due)
  })
})

describe('the rows and signer on a Maine permit', () => {
  it('an internal plumbing permit has no code edition row and is signed by the plumbing inspector', async () => {
    const text = await permitText(await issued(PLUMBING_TYPE))
    expect(text).not.toContain('Code edition')
    expect(text).toContain(PLUMBING_SIGNER)
    expect(text).not.toContain(BUILDING_SIGNER)
  })

  it('a building permit prints the code edition date in words', async () => {
    const applicationId = await issued(BUILDING_TYPE)
    const edition = ME_CODE_EDITIONS.find((e) => e.key === ME_2021_EDITION_KEY)
    if (edition === undefined) throw new Error('missing edition')
    await handle.db.insert(codeEditionRecords).values({
      applicationId,
      receiptDate: '2027-06-01',
      editionKey: edition.key,
      editionLabel: edition.label,
      editionStatus: 'verified',
      localAmendmentsInForce: [],
      recordedBy: w.world.staff.userId,
    })
    const text = await permitText(applicationId)
    expect(text).toContain('April 7, 2025')
    expect(text).not.toContain('2025-04-07')
    expect(text).toContain(BUILDING_SIGNER)
  })
})
