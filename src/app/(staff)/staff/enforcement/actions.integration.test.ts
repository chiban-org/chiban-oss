import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { enforcementCases, enforcementOrders, roleCapabilities } from '@/db/schema'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  type EnforcementWorld,
  type IssuedOrder,
  issuedOrder,
  setupEnforcementWorld,
} from '@/test/enforcementFixtures'
import { makeTestStore } from '@/test/minio'
import { makeParcel } from '@/test/parcels'

interface MockState {
  db: unknown
  csrfCookie: string | null
  actor: unknown
}

const state = vi.hoisted((): MockState => ({ db: null, csrfCookie: 'tok', actor: null }))

vi.mock('@/db/client', () => ({
  get db() {
    return state.db
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) =>
        name === 'chiban_csrf' && state.csrfCookie !== null
          ? { value: state.csrfCookie }
          : undefined,
    }),
  headers: () =>
    Promise.resolve(
      new Headers({
        origin: 'https://alderpond.example',
        host: 'alderpond.example',
        'sec-fetch-site': 'same-origin',
      }),
    ),
}))
vi.mock('@/server/getActor', () => ({ getActor: () => Promise.resolve(state.actor) }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  },
}))

const main = await import('@/app/(staff)/staff/enforcement/actions')
const service = await import('@/app/(staff)/staff/enforcement/serviceActions')
const appeals = await import('@/app/(staff)/staff/enforcement/appealActions')
const money = await import('@/app/(staff)/staff/enforcement/moneyActions')
const uploads = await import('@/app/(staff)/staff/enforcement/uploadActions')
const admin = await import('@/app/(staff)/staff/admin/anonymous-intake/actions')
const officers = await import('@/app/(staff)/staff/admin/enforcement-officers/actions')

let handle: TestDb
let world: EnforcementWorld
let order: IssuedOrder

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  world = await setupEnforcementWorld(handle.db)
  const { store } = await makeTestStore()
  order = await issuedOrder(handle.db, store, world)
})
afterAll(async () => {
  await handle.drop()
})
beforeEach(() => {
  state.csrfCookie = 'tok'
  state.actor = world.staff
})

async function openedAt(fields: Record<string, string>): Promise<string> {
  const failure = await main.openCaseAction(form(fields)).then(JSON.stringify, String)
  return failure.replace(/^Error: NEXT_REDIRECT:/, '')
}

function form(fields: Record<string, string>, token: string | null = 'tok'): FormData {
  const f = new FormData()
  if (token !== null) f.set('csrf_token', token)
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

const ALL = {
  openCaseAction: main.openCaseAction,
  staffComplaintAction: main.staffComplaintAction,
  setCaseStatusAction: main.setCaseStatusAction,
  addNoteAction: main.addNoteAction,
  recordFindingAction: main.recordFindingAction,
  sendNoticeAction: main.sendNoticeAction,
  recordNoticeReceiptAction: main.recordNoticeReceiptAction,
  draftOrderAction: main.draftOrderAction,
  issueOrderAction: main.issueOrderAction,
  complaintPublicTextAction: main.complaintPublicTextAction,
  publishCaseAction: main.publishCaseAction,
  unpublishCaseAction: main.unpublishCaseAction,
  listRecipientAction: service.listRecipientAction,
  roleCheckAction: service.roleCheckAction,
  serviceEventAction: service.serviceEventAction,
  answerAction: service.answerAction,
  courtStepAction: service.courtStepAction,
  appealAction: appeals.appealAction,
  resolveAppealAction: appeals.resolveAppealAction,
  certifyPerilAction: appeals.certifyPerilAction,
  restrainingOrderAction: appeals.restrainingOrderAction,
  dissolveRestrainingOrderAction: appeals.dissolveRestrainingOrderAction,
  fineAction: money.fineAction,
  finePaymentAction: money.finePaymentAction,
  referAction: money.referAction,
  outcomeAction: money.outcomeAction,
  createCaseUploadIntentAction: uploads.createCaseUploadIntentAction,
  finalizeCaseUploadAction: uploads.finalizeCaseUploadAction,
  designateOfficerAction: officers.designateOfficerAction,
  enableAnonymousIntakeAction: admin.enableAnonymousIntakeAction,
  disableAnonymousIntakeAction: admin.disableAnonymousIntakeAction,
}

describe('enforcement server actions', () => {
  it('a case opened with a parcel number or exact site address is linked to that parcel', async () => {
    const parcelId = await makeParcel(handle.db, [{ format: 'gis12', value: '031004000000' }], {
      siteAddress: '4 Linden Way',
    })
    await openedAt({ locationText: 'Behind the barn', parcelRef: '031-004-000-000' })
    const byAddress = await main.staffComplaintAction(
      form({ locationText: '4 linden way', description: 'Junk cars in the yard' }),
    )
    expect(byAddress.ok).toBe(true)
    const linked = await handle.db
      .select({ parcelId: enforcementCases.parcelId })
      .from(enforcementCases)
      .where(eq(enforcementCases.parcelId, parcelId))
    expect(linked).toHaveLength(2)
  })

  it('a case without a parcel can be linked to one from the case page', async () => {
    const parcelId = await makeParcel(handle.db, [{ format: 'gis12', value: '031005000000' }])
    await openedAt({ locationText: 'Unnamed lot' })
    const [row] = await handle.db
      .select()
      .from(enforcementCases)
      .where(eq(enforcementCases.locationText, 'Unnamed lot'))
    const linked = await (
      main as unknown as { setCaseParcelAction?: (f: FormData) => Promise<{ ok: boolean }> }
    ).setCaseParcelAction?.(form({ caseId: row?.id ?? '', parcelRef: '031005000000' }))
    expect(linked?.ok).toBe(true)
    const [after] = await handle.db
      .select()
      .from(enforcementCases)
      .where(eq(enforcementCases.id, row?.id ?? ''))
    expect(after?.parcelId).toBe(parcelId)
  })

  it('a parcel chosen in the picker links by its record id and the new case opens', async () => {
    const parcelId = await makeParcel(handle.db, [{ format: 'gis12', value: '031006000000' }])
    const path = await openedAt({
      locationText: 'Gravel pit off the county road',
      parcelRef: parcelId,
    })
    const [row] = await handle.db
      .select({ id: enforcementCases.id, parcelId: enforcementCases.parcelId })
      .from(enforcementCases)
      .where(eq(enforcementCases.locationText, 'Gravel pit off the county road'))
    expect(row?.parcelId).toBe(parcelId)
    expect(path).toBe(`/staff/enforcement/${row?.id}`)
  })

  it.each(Object.entries(ALL))('%s rejects a missing csrf token', async (_name, action) => {
    state.actor = world.admin
    expect(await action(form({}, null))).toMatchObject({ ok: false })
  })

  it.each(Object.entries(ALL))('%s refuses a signed-out visitor', async (_name, action) => {
    state.actor = null
    expect(await action(form({}))).toMatchObject({ ok: false })
  })

  it('issueOrderAction without a csrf token is refused and changes nothing', async () => {
    const result = await main.issueOrderAction(
      form({ orderId: order.orderId, issuedOn: '2027-03-02', expectedRowVersion: '1' }, null),
    )
    expect(result).toMatchObject({ ok: false })
    const [row] = await handle.db
      .select()
      .from(enforcementOrders)
      .where(eq(enforcementOrders.id, order.orderId))
    expect(row?.status).toBe('issued')
  })

  it('a court step without a court document names the missing document', async () => {
    const result = await service.courtStepAction(
      form({
        orderId: order.orderId,
        kind: 'filed_with_clerk',
        occurredOn: '2027-03-02',
        court: 'Alder Pond District Court',
      }),
    )
    expect(result).toEqual({
      ok: false,
      error:
        'Choose the court document. Upload it in the Documents section first, as a court document.',
    })
  })

  it('service handed to a person with no recipient chosen says to choose one', async () => {
    const result = await service.serviceEventAction(
      form({ orderId: order.orderId, recipientId: '', method: 'in_hand', servedOn: '2027-03-02' }),
    )
    expect(result).toEqual({
      ok: false,
      error:
        'Choose who was served. Posting and newspaper publication are the only methods recorded without a recipient.',
    })
  })

  it('opens a case through the action', async () => {
    const path = await openedAt({ locationText: '9 Alder Court' })
    const rows = await handle.db
      .select()
      .from(enforcementCases)
      .where(eq(enforcementCases.locationText, '9 Alder Court'))
    expect(rows).toHaveLength(1)
    expect(path).toBe(`/staff/enforcement/${rows[0]?.id}`)
  })

  it('an invalid form is answered with the form message, not a stack', async () => {
    const result = await main.openCaseAction(form({ locationText: '' }))
    expect(result).toEqual({ ok: false, error: 'Check the form fields and try again.' })
  })

  it('inspector without enforcement.issue_order is forbidden via server action', async () => {
    await handle.db
      .delete(roleCapabilities)
      .where(
        and(
          eq(roleCapabilities.role, 'inspector'),
          eq(roleCapabilities.capability, 'enforcement.issue_order'),
        ),
      )
    state.actor = world.inspector
    const result = await main.issueOrderAction(
      form({ orderId: order.orderId, issuedOn: '2027-03-02', expectedRowVersion: '1' }),
    )
    expect(result).toEqual({ ok: false, error: 'You do not have permission to do this.' })
  })

  it('motion recorded through the server action without enforcement.record_service is forbidden', async () => {
    state.actor = world.finance
    const result = await service.courtStepAction(
      form({
        orderId: order.orderId,
        kind: 'motion_to_enforce',
        occurredOn: '2027-03-23',
        court: 'District Court',
        documentId: crypto.randomUUID(),
      }),
    )
    expect(result).toEqual({ ok: false, error: 'You do not have permission to do this.' })
  })

  it('a missing-content refusal names what is missing in words', async () => {
    state.actor = world.staff
    expect(await openedAt({ locationText: '12 Pine Court' })).toMatch(/^\/staff\/enforcement\//)
    const result = await main.draftOrderAction(
      form({ caseId: crypto.randomUUID(), findingIds: crypto.randomUUID(), correctiveAction: '' }),
    )
    expect(result.ok).toBe(false)
    expect(JSON.stringify(result)).not.toMatch(/[a-z]+_[a-z_]+/)
  })

  it('turning anonymous intake on without a passing retention check is refused in words', async () => {
    state.actor = world.admin
    const result = await admin.enableAnonymousIntakeAction(form({}))
    expect(result).toEqual({
      ok: false,
      error: 'Anonymous intake needs a passing retention check for the version that is running.',
    })
  })
})
