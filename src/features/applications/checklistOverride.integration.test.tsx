import { eq } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { ChecklistActions } from '@/components/documents/checklistTypes'
import { DocumentChecklist } from '@/components/documents/DocumentChecklist'
import { applications, users } from '@/db/schema'
import { loadApplicationContext } from '@/features/applications/context'
import { loadDocumentChecklist } from '@/features/applications/documentChecklistView'
import { evaluateGates } from '@/features/gates/evaluateGates'
import { overrideAdministrativeGate, recordStatutoryException } from '@/features/gates/overrides'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { moveTo, SEPTIC } from '@/test/documentItemFixtures'
import { staffActor } from '@/test/parcels'
import type { CivilDate } from '@/types/civilDate'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))

const signal = new AbortController().signal
const REASON = 'State approval confirmed by phone with the septic bureau.'
const noop = () => Promise.resolve({ ok: true as const, message: 'ok' })
const ACTIONS: ChecklistActions = { link: noop, unlink: noop, accept: noop, undoAccept: noop }
let handle: TestDb
let world: PermitWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db, { buildingType: { documents: [SEPTIC] } })
})
afterEach(async () => {
  await handle.drop()
})

async function clearOtherGates(applicationId: string) {
  const app = await loadApplicationContext(handle.db, applicationId, signal)
  if (app === null) throw new Error('no application')
  const results = await handle.db.transaction((tx) =>
    evaluateGates(tx, app, 'issued', '2027-03-10' as CivilDate, signal),
  )
  const admin = await staffActor(handle.db, 'admin')
  for (const gate of results.filter((g) => g.effective === 'blocked')) {
    const reason = gate.key === 'documents.before_issue' ? REASON : 'Cleared for this test.'
    const done =
      gate.kind === 'administrative'
        ? await overrideAdministrativeGate(
            handle.db,
            world.staff,
            { applicationId, gateKey: gate.key, reason },
            signal,
          )
        : await recordStatutoryException(
            handle.db,
            admin,
            {
              applicationId,
              gateKey: gate.key,
              legalAuthority: { citation: 'Town rule 1', explanation: 'Cleared for this test.' },
            },
            signal,
          )
    expect(done).toEqual({ ok: true, value: undefined })
  }
}

async function rendered(actor: 'staff' | 'applicant', applicationId: string) {
  const view = await loadDocumentChecklist(
    handle.db,
    actor === 'staff' ? world.staff : world.applicant,
    applicationId,
    signal,
  )
  if (view === null) throw new Error('no checklist')
  const row = view.stages.flatMap((s) => s.rows).find((r) => r.key === SEPTIC.key)
  const html = renderToStaticMarkup(
    <CsrfProvider token="t1">
      <DocumentChecklist
        view={view}
        actor={actor}
        permissions={{ canFile: true, canAccept: actor === 'staff', canUploadOther: false }}
        actions={ACTIONS}
        maxBytes={1024}
      />
    </CsrfProvider>,
  )
  return { row, html }
}

describe('a document gate overridden at issuance', () => {
  it('shows the override on the checklist row for staff and the applicant', async () => {
    const { applicationId } = await makeApplication(handle.db, world, { state: 'decided' })
    await clearOtherGates(applicationId)
    const issued = await moveTo(handle.db, world.staff, applicationId, 'issued')
    expect(issued.ok).toBe(true)
    const [stored] = await handle.db
      .select({ state: applications.state })
      .from(applications)
      .where(eq(applications.id, applicationId))
    expect(stored?.state).toBe('issued')
    const [clerk] = await handle.db
      .select({ name: users.displayName })
      .from(users)
      .where(eq(users.id, world.staff.userId))
    for (const actor of ['staff', 'applicant'] as const) {
      const { row, html } = await rendered(actor, applicationId)
      expect(row?.override).toMatchObject({ reason: REASON, by: clerk?.name })
      expect(html).toContain('Gone ahead without the document')
      expect(html).toContain(`Overridden: ${REASON} (${clerk?.name ?? ''}, `)
      expect(html).not.toContain('Can come later')
    }
  })
})
