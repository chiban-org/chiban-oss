import { beforeAll, describe, expect, it, vi } from 'vitest'
import { ROLES } from '@/constants/roles'
import { cutoverReconciliations } from '@/db/schema'
import { CHECK_PASSED, refuseField } from '@/server/formInput'
import { seedParcelWorld } from '@/test/parcels'
import {
  actionHarness,
  describeActionCases,
  STAFF_REFUSALS,
  uuid,
} from '@/test/testHarness/actions'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))

const { importCutoverAction, reconcileCutoverAction, signOffReconciliationAction } = await import(
  './actions'
)

const h = actionHarness()
beforeAll(async () => {
  await seedParcelWorld(h.db)
})

const HEADER = 'legacy_number,application_type_key,parcel_id,state,received_date,applicant_email'

function csv(text: string): File {
  return new File([text], 'applications.csv', { type: 'text/csv' })
}

const UNKNOWN_TYPE_ROW = csv(`${HEADER}\nL-1,no-such-type,031-004,submitted,2026-01-05,\n`)

describeActionCases(h, 'importCutoverAction', {
  invoke: importCutoverAction,
  actor: () => h.actorFor('admin'),
  input: () => ({ file: UNKNOWN_TYPE_ROW }),
  fields: {},
  capability: 'cutover.import',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refuseField('file', 'Choose a CSV file.'),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { written }) => {
    expect(result).toEqual({
      ok: true,
      message:
        'Dry run, nothing saved: 0 would import, 0 already imported, 1 with errors. Line 2 (L-1): No parcel in Chiban matches the parcel ID on this row.',
    })
    expect(written).toEqual([])
  },
})

describe('importCutoverAction refusals beside the file field', () => {
  async function importing(file: File | undefined) {
    h.signIn(await h.actorFor('admin'))
    return await h.recordWrites(() => importCutoverAction(h.form({ file })))
  }

  it('refuses no file', async () => {
    const { value, written } = await importing(undefined)
    expect({ value, written }).toEqual({
      value: refuseField('file', 'Choose a CSV file.'),
      written: [],
    })
  })

  it('refuses an empty file', async () => {
    const { value } = await importing(csv(''))
    expect(value).toEqual(refuseField('file', 'Choose a CSV file.'))
  })

  it('says a header-only template has no applications instead of being unreadable', async () => {
    const { value } = await importing(csv(`${HEADER}\n`))
    expect(value).toEqual(
      refuseField(
        'file',
        'The file has a header row but no applications. Add one row per application below the header.',
      ),
    )
  })

  it('names the missing columns for a file with the wrong header', async () => {
    const { value } = await importing(csv('name,date\nA,2026-01-01\n'))
    expect(value).toEqual(
      refuseField(
        'file',
        'The header row is missing columns. Download the template and keep the header row, including legacy_number, application_type_key, parcel_id, state, and received_date.',
      ),
    )
  })

  it('flags a bad applicant email in the dry run', async () => {
    const file = csv(`${HEADER}\nL-2,no-such-type,031-004,submitted,2026-01-05,not-an-email\n`)
    const { value } = await importing(file)
    expect(value).toMatchObject({
      ok: true,
      message: expect.stringContaining(
        'The applicant email must look like name@example.com, or be left empty.',
      ),
    })
  })
})

describeActionCases(h, 'reconcileCutoverAction', {
  invoke: reconcileCutoverAction,
  actor: () => h.actorFor('admin'),
  input: () => ({ file: csv('legacy_number\nL-1\nL-2\n') }),
  fields: {},
  capability: 'cutover.import',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refuseField('file', "Choose the town's list as a CSV file."),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { written }) => {
    expect(result).toEqual({
      ok: true,
      message:
        'Compared: 0 matched. On the list but not imported: L-1, L-2. Imported but not on the list: none.',
    })
    expect(written).toEqual(['cutover_reconciliations'])
  },
})

describe('reconcileCutoverAction refusals beside the file field', () => {
  async function comparing(file: File | undefined) {
    h.signIn(await h.actorFor('admin'))
    return await reconcileCutoverAction(h.form({ file }))
  }

  it('refuses no file', async () => {
    expect(await comparing(undefined)).toEqual(
      refuseField('file', "Choose the town's list as a CSV file."),
    )
  })

  it('names the compare file column instead of the import columns', async () => {
    const result = await comparing(csv('number\nL-1\n'))
    expect(result).toEqual(
      refuseField(
        'file',
        'The list needs a column named legacy_number in its header row, with one legacy number per row.',
      ),
    )
  })

  it('says a list with only a header has no legacy numbers', async () => {
    expect(await comparing(csv('legacy_number\n'))).toEqual(
      refuseField(
        'file',
        'The list has a header row but no legacy numbers. Add one legacy number per row.',
      ),
    )
  })
})

async function openComparison(): Promise<string> {
  const [row] = await h.db
    .insert(cutoverReconciliations)
    .values({
      listSha256: 'a'.repeat(64),
      createdBy: (await h.actorFor('admin')).userId,
      report: {
        inListAndImported: [],
        inListNotImported: [],
        importedNotInList: [],
        documentCounts: {},
      },
    })
    .returning({ id: cutoverReconciliations.id })
  return row?.id ?? ''
}

describeActionCases(h, 'signOffReconciliationAction', {
  invoke: signOffReconciliationAction,
  actor: () => h.actorFor('admin'),
  input: async () => ({ reconciliationId: await openComparison() }),
  fields: { reconciliationId: uuid({ required: true }) },
  refusedRoles: ROLES.filter((role) => role !== 'admin'),
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refuseField('reconciliationId', 'Choose a comparison.'),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { written }) => {
    expect(result).toEqual({ ok: true, message: 'Reconciliation signed off.' })
    expect(written).toEqual(expect.arrayContaining(['cutover_reconciliations']))
  },
})
