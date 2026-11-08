import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadDocumentChecklist } from '@/features/applications/documentChecklistView'
import { attachDocument } from '@/features/documents/attach'
import { storeGeneratedBytes } from '@/features/files/ingest'
import { getPortalApplicationView } from '@/features/portal/portalView'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { pdfBytes, uploadAs } from '@/test/documentFixtures'
import { PLOT_PLAN } from '@/test/documentItemFixtures'
import { makeTestStore } from '@/test/objectStore'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const { PortalDocuments } = await import('./PortalDocuments')

const signal = new AbortController().signal
let handle: TestDb
let world: PermitWorld
let store: ObjectStore

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db, { buildingType: { documents: [PLOT_PLAN] } })
  store = (await makeTestStore()).store
})
afterEach(async () => {
  await handle.drop()
})

async function issuedPermit(applicationId: string): Promise<void> {
  await handle.db.transaction(async (tx) => {
    const stored = await storeGeneratedBytes(
      tx,
      store,
      pdfBytes('permit'),
      'application/pdf',
      signal,
    )
    await attachDocument(
      tx,
      { kind: 'system', job: 'test' },
      {
        target: { kind: 'application', id: applicationId },
        title: 'Building permit BP-2027-0001',
        docKind: 'issued_permit',
        audiences: ['project_parties'],
        isPublic: false,
        file: { sha256: stored.sha256, filename: 'permit.pdf', contentType: 'application/pdf' },
      },
      signal,
    )
  })
}

describe('the portal documents section on a type with required documents', () => {
  it('keeps issued records beside the checklist', async () => {
    const { applicationId } = await makeApplication(handle.db, world, { state: 'issued' })
    await uploadAs(
      handle.db,
      store,
      world.staff,
      { kind: 'application', id: applicationId },
      pdfBytes('plot plan'),
      { title: 'Plot plan', itemKey: 'plot_plan' },
    )
    await issuedPermit(applicationId)
    const view = await getPortalApplicationView(handle.db, world.applicant, applicationId, signal)
    if (!view.ok) throw new Error('view failed')
    const checklist = await loadDocumentChecklist(handle.db, world.applicant, applicationId, signal)
    expect(checklist).not.toBeNull()
    const html = renderToStaticMarkup(PortalDocuments({ view: view.value, checklist, zone: 'UTC' }))
    expect(html).toContain('Plot plan')
    expect(html).toContain('Building permit BP-2027-0001')
  })
})
