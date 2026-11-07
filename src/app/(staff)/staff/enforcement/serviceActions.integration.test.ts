import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { orderServiceEvents, orderServiceRecipients, orderServiceRoleChecks } from '@/db/schema'
import { listRecipient } from '@/features/enforcement/service'
import { CHECK_PASSED, refuseField } from '@/server/formInput'
import { dateMessage, idMessage, textMessage } from '@/test/boardCases'
import { lazy } from '@/test/boardPanelFixtures'
import {
  FULL_RANGE,
  PAST_ONLY,
  pastDateMessage,
  useEnforcementClock,
} from '@/test/enforcementCases'
import {
  type EnforcementWorld,
  type IssuedOrder,
  issuedOrder,
  setupEnforcementWorld,
  uploadProof,
} from '@/test/enforcementFixtures'
import {
  actionHarness,
  choice,
  date,
  describeActionCases,
  type InvalidVariant,
  STAFF_REFUSALS,
  text,
  uuid,
} from '@/test/testHarness/actions'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))
vi.mock(
  '@/features/storage/objectStore',
  () => import('@/test/testHarness/actions/mocks/objectStore'),
)

const actions = await import('./serviceActions')

const h = actionHarness()
h.useObjectStore()
useEnforcementClock()
const signal = new AbortController().signal
let world: EnforcementWorld

beforeAll(async () => {
  world = await setupEnforcementWorld(h.db)
})

const order = lazy<IssuedOrder>(() =>
  issuedOrder(h.db, h.store, world, { location: '61 Pine Way' }),
)

async function newRecipient(name: string): Promise<string> {
  const { orderId } = await order()
  const listed = await listRecipient(
    h.db,
    world.staff,
    { orderId, role: 'record_owner', name, address: '61 Pine Way', source: 'CAMA owner' },
    signal,
  )
  if (!listed.ok) throw new Error(listed.error)
  return listed.value.recipientId
}

const proofDocument = async () =>
  await uploadProof(h.db, h.store, world.staff, (await order()).caseId)

function recipientRefusal(variant: InvalidVariant) {
  switch (variant.field) {
    case 'orderId':
      return refuseField('orderId', idMessage('an order'))
    case 'role':
      return refuseField('role', 'Choose a role.')
    case 'name':
      return refuseField('name', textMessage('a name', 200, variant))
    case 'address':
      return refuseField('address', textMessage('an address', 500, variant))
    default:
      return refuseField('source', textMessage('where the name came from', 300, variant))
  }
}

describeActionCases(h, 'listRecipientAction', {
  invoke: actions.listRecipientAction,
  actor: () => world.staff,
  input: async () => ({
    orderId: (await order()).orderId,
    role: 'taxpayer',
    name: 'Pat Taxpayer',
    address: '9 Mill Road',
    source: 'Tax bill',
  }),
  fields: {
    orderId: uuid({ required: true }),
    role: choice({ required: true }),
    name: text({ required: true, max: 200 }),
    address: text({ required: true, max: 500 }),
    source: text({ required: true, max: 300 }),
  },
  capability: 'enforcement.record_service',
  refusals: { ...STAFF_REFUSALS, invalid: recipientRefusal, checkOnly: CHECK_PASSED },
  accepted: async (result, { db }) => {
    expect(result).toEqual({ ok: true, message: 'Recipient added.' })
    const rows = await db
      .select({ name: orderServiceRecipients.name, role: orderServiceRecipients.role })
      .from(orderServiceRecipients)
      .where(eq(orderServiceRecipients.orderId, (await order()).orderId))
    expect(rows).toContainEqual({ name: 'Pat Taxpayer', role: 'taxpayer' })
  },
})

function roleCheckRefusal(variant: InvalidVariant) {
  switch (variant.field) {
    case 'orderId':
      return refuseField('orderId', idMessage('an order'))
    case 'role':
      return refuseField('role', 'Choose a role.')
    case 'outcome':
      return refuseField('outcome', 'Choose a result.')
    case 'basis':
      return refuseField('basis', textMessage('what was searched', 500, variant))
    default:
      return refuseField('checkedOn', pastDateMessage('the date checked', variant))
  }
}

describeActionCases(h, 'roleCheckAction', {
  invoke: actions.roleCheckAction,
  actor: () => world.staff,
  input: async () => ({
    orderId: (await order()).orderId,
    role: 'occupying_tenant',
    outcome: 'none_exist',
    basis: 'Registry search on file',
    checkedOn: '2027-03-01',
  }),
  fields: {
    orderId: uuid({ required: true }),
    role: choice({ required: true }),
    outcome: choice({ required: true }),
    basis: text({ required: true, max: 500 }),
    checkedOn: date({ required: true, ...PAST_ONLY }),
  },
  capability: 'enforcement.record_service',
  refusals: { ...STAFF_REFUSALS, invalid: roleCheckRefusal, checkOnly: CHECK_PASSED },
  accepted: async (result, { db }) => {
    expect(result).toEqual({ ok: true, message: 'Check recorded.' })
    const rows = await db
      .select({ role: orderServiceRoleChecks.role, outcome: orderServiceRoleChecks.outcome })
      .from(orderServiceRoleChecks)
      .where(eq(orderServiceRoleChecks.orderId, (await order()).orderId))
    expect(rows).toContainEqual({ role: 'occupying_tenant', outcome: 'none_exist' })
  },
})

describe('roleCheckAction beyond the table', () => {
  it('names the result field for a result the role cannot have', async () => {
    h.signIn(world.staff)
    const { orderId } = await order()
    const { value, written } = await h.recordWrites(() =>
      actions.roleCheckAction(
        h.form({
          orderId,
          role: 'record_owner',
          outcome: 'none_exist',
          basis: 'Searched the registry',
          checkedOn: '2027-03-01',
        }),
      ),
    )
    expect({ value, written }).toEqual({
      value: refuseField('outcome', 'That result is not allowed for this role.'),
      written: [],
    })
  })

  it('refuses a check dated 2099-01-01 beside the date', async () => {
    h.signIn(world.staff)
    const result = await actions.roleCheckAction(
      h.form({
        orderId: (await order()).orderId,
        role: 'occupying_tenant',
        outcome: 'none_exist',
        basis: 'Searched the registry',
        checkedOn: '2099-01-01',
      }),
    )
    expect(result).toEqual(
      refuseField('checkedOn', 'Enter the date checked between January 1, 1900 and July 20, 2027.'),
    )
  })
})

const forService = lazy(async () => ({
  recipientId: await newRecipient('Pat Owner'),
  proofId: await proofDocument(),
}))

const serviceFields = async () => {
  const { recipientId, proofId } = await forService()
  return {
    orderId: (await order()).orderId,
    recipientId,
    method: 'in_hand',
    servedOn: '2027-03-01',
    serverName: 'Sheriff Dale',
    serverRole: 'sheriff',
    newspaper: '',
    proofDocumentId: proofId,
  }
}

function serviceRefusal(variant: InvalidVariant) {
  switch (variant.field) {
    case 'orderId':
      return refuseField('orderId', idMessage('an order'))
    case 'recipientId':
      return refuseField('recipientId', 'Choose who was served.')
    case 'method':
      return refuseField('method', 'Choose a method.')
    case 'servedOn':
      return refuseField('servedOn', dateMessage('the date served', variant))
    case 'serverName':
      return refuseField('serverName', textMessage('the name of the server', 200, variant))
    case 'serverRole':
      return refuseField('serverRole', 'Choose what the server is.')
    case 'newspaper':
      return refuseField('newspaper', textMessage('the newspaper', 200, variant))
    default:
      return refuseField('proofDocumentId', 'Choose the proof of service.')
  }
}

describeActionCases(h, 'serviceEventAction', {
  invoke: actions.serviceEventAction,
  actor: () => world.staff,
  input: serviceFields,
  fields: {
    orderId: uuid({ required: true }),
    recipientId: uuid(),
    method: choice({ required: true }),
    servedOn: date({ required: true, ...FULL_RANGE }),
    serverName: text({ max: 200 }),
    serverRole: choice(),
    newspaper: text({ max: 200 }),
    proofDocumentId: uuid(),
  },
  capability: 'enforcement.record_service',
  refusals: { ...STAFF_REFUSALS, invalid: serviceRefusal, checkOnly: CHECK_PASSED },
  accepted: async (result, { db }) => {
    expect(result).toEqual({ ok: true, message: 'Service recorded.' })
    const rows = await db
      .select({ method: orderServiceEvents.method, servedOn: orderServiceEvents.servedOn })
      .from(orderServiceEvents)
      .where(eq(orderServiceEvents.orderId, (await order()).orderId))
    expect(rows).toEqual([{ method: 'in_hand', servedOn: '2027-03-01' }])
  },
})

describe('serviceEventAction keeps only the fields the method uses', () => {
  it('drops a newspaper sent with hand service', async () => {
    h.signIn(world.staff)
    const fields = { ...(await serviceFields()), recipientId: await newRecipient('Lee Ledger') }
    const result = await actions.serviceEventAction(
      h.form({ ...fields, newspaper: 'Alder Ledger' }),
    )
    expect(result).toEqual({ ok: true, message: 'Service recorded.' })
    const rows = await h.db
      .select({ newspaper: orderServiceEvents.newspaper, server: orderServiceEvents.serverName })
      .from(orderServiceEvents)
      .where(eq(orderServiceEvents.recipientId, fields.recipientId))
    expect(rows).toEqual([{ newspaper: null, server: 'Sheriff Dale' }])
  })
})

describe('serviceEventAction refusals the feature owns', () => {
  async function refusedWith(overrides: Record<string, string>) {
    h.signIn(world.staff)
    const form = h.form({ ...(await serviceFields()), ...overrides })
    return await h.recordWrites(() => actions.serviceEventAction(form))
  }

  it('refuses a service date in the future beside the date', async () => {
    expect(await refusedWith({ servedOn: '2099-01-01' })).toEqual({
      value: refuseField('servedOn', 'The date cannot be in the future.'),
      written: [],
    })
  })

  it('refuses hand delivery with no recipient beside the recipient', async () => {
    expect(await refusedWith({ recipientId: '' })).toEqual({
      value: refuseField(
        'recipientId',
        'Choose who was served. Posting and newspaper publication are the only methods recorded without a recipient.',
      ),
      written: [],
    })
  })

  it('refuses hand delivery with no proof beside the proof', async () => {
    const { value, written } = await refusedWith({ proofDocumentId: '' })
    expect(written).toEqual([])
    expect(value).toEqual(
      refuseField(
        'proofDocumentId',
        'Upload the proof first, then choose it here. Proof of service is a return of service, an affidavit of posting, or a newspaper tear sheet.',
      ),
    )
  })

  it('refuses hand delivery without a server of a listed kind beside the server role', async () => {
    expect(await refusedWith({ serverRole: '' })).toEqual({
      value: refuseField(
        'serverRole',
        'Hand delivery needs a server who is a sheriff, deputy sheriff, local police officer, or constable.',
      ),
      written: [],
    })
  })

  it('refuses posting before the owner is marked not found beside the method', async () => {
    expect(await refusedWith({ method: 'posting_on_property', recipientId: '' })).toEqual({
      value: refuseField(
        'method',
        'Posting and publication are allowed only after the owner of record is marked as not found.',
      ),
      written: [],
    })
  })
})

const forAnswer = lazy(async () => ({
  recipientId: await newRecipient('Quinn Answerer'),
  documentId: await proofDocument(),
}))

function answerRefusal(variant: InvalidVariant) {
  switch (variant.field) {
    case 'recipientId':
      return refuseField('recipientId', 'Choose who answered.')
    case 'answeredOn':
      return refuseField('answeredOn', pastDateMessage('the date the answer was received', variant))
    default:
      return refuseField(
        'documentId',
        'Choose the answer document. Upload it above the form if it is not listed.',
      )
  }
}

describeActionCases(h, 'answerAction', {
  invoke: actions.answerAction,
  actor: () => world.staff,
  input: async () => ({ ...(await forAnswer()), answeredOn: '2027-03-08' }),
  fields: {
    recipientId: uuid({ required: true }),
    answeredOn: date({ required: true, ...PAST_ONLY }),
    documentId: uuid({ required: true }),
  },
  capability: 'enforcement.record_service',
  refusals: { ...STAFF_REFUSALS, invalid: answerRefusal, checkOnly: CHECK_PASSED },
  accepted: async (result, { db }) => {
    expect(result).toEqual({ ok: true, message: 'Answer recorded.' })
    const [row] = await db
      .select({ answeredOn: orderServiceRecipients.answeredOn })
      .from(orderServiceRecipients)
      .where(eq(orderServiceRecipients.id, (await forAnswer()).recipientId))
    expect(row?.answeredOn).toBe('2027-03-08')
  },
})

describe('answerAction with a document from another case', () => {
  it('refuses beside the document and records nothing', async () => {
    h.signIn(world.staff)
    const { recipientId } = await forAnswer()
    const otherCase = await issuedOrder(h.db, h.store, world, {
      location: '62 Pine Way',
      skipDesignation: true,
    })
    const foreign = await uploadProof(h.db, h.store, world.staff, otherCase.caseId)
    const { value, written } = await h.recordWrites(() =>
      actions.answerAction(h.form({ recipientId, answeredOn: '2027-03-08', documentId: foreign })),
    )
    expect({ value, written }).toEqual({
      value: refuseField('documentId', 'Choose a document that belongs to this case.'),
      written: [],
    })
  })
})
