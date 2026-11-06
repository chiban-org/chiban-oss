import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  aliasOverrides,
  parcelLineageEvents,
  parcelRecordCarryForwards,
  parcelRecordLinks,
} from '@/db/schema'
import { recordLineageEvent } from '@/features/parcels/lineage'
import { formatCivilDate } from '@/lib/formatDate'
import { CHECK_PASSED, refuseField } from '@/server/formInput'
import { makeParcel, seedParcelWorld } from '@/test/parcels'
import { dateCopy, textCopy } from '@/test/recordsCases'
import { RECORDS_NOW } from '@/test/recordsClock'
import { refusalFor } from '@/test/refusalCopy'
import {
  actionHarness,
  choice,
  date,
  describeActionCases,
  STAFF_REFUSALS,
  text,
  uuid,
} from '@/test/testHarness/actions'
import { type CivilDate, todayInTimeZone } from '@/types/civilDate'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))

const actions = await import('./actions')

const h = actionHarness()
const signal = new AbortController().signal
const today = todayInTimeZone('America/New_York', RECORDS_NOW)
const staff = () => h.actorFor('staff')
let counter = 0
const freshId = () => String(700_000_000_000 + (counter += 1) * 1000).padStart(12, '0')
const freshParcel = () => makeParcel(h.db, [{ format: 'gis12', value: freshId() }])

beforeAll(async () => {
  await seedParcelWorld(h.db)
  vi.useFakeTimers({ toFake: ['Date'], now: RECORDS_NOW })
})
afterAll(() => {
  vi.useRealTimers()
})

describeActionCases(h, 'recordLineageAction', {
  invoke: actions.recordLineageAction,
  actor: staff,
  input: async () => ({
    kind: 'subdivision',
    effectiveDate: '2026-05-01',
    effectiveBasis: 'recording',
    reference: 'Book 12 page 4',
    parents: await freshParcel(),
    children: `${freshId()} ${freshId()}`,
  }),
  fields: {
    kind: choice({ required: true }),
    effectiveDate: date({ required: true, earliest: '1900-01-01', latest: today }),
    effectiveBasis: choice({ required: true }),
    reference: text({ max: 200 }),
    parents: text({ required: true, max: 2000 }),
    children: text({ required: true, max: 2000 }),
  },
  capability: 'parcel.manage',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalFor({
      kind: 'Choose a kind of event.',
      effectiveDate: dateCopy('the effective date', today),
      effectiveBasis: 'Choose a date basis.',
      reference: textCopy('a recording reference', 200),
      parents: textCopy('at least one parent parcel', 2000),
      children: textCopy('at least one child parcel', 2000),
    }),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { db, written }) => {
    expect(result).toEqual({ ok: true, message: 'Lineage event recorded.' })
    expect(written).toContain('parcel_lineage_events')
    expect((await db.select().from(parcelLineageEvents)).at(-1)).toMatchObject({
      kind: 'subdivision',
      effectiveDate: '2026-05-01',
    })
  },
})

describe('recordLineageAction children and parents', () => {
  const attempt = async (patch: Record<string, string>) => {
    h.signIn(await staff())
    const form = h.form({
      kind: 'subdivision',
      effectiveDate: '2026-05-01',
      effectiveBasis: 'recording',
      parents: await freshParcel(),
      children: `${freshId()} ${freshId()}`,
      ...patch,
    })
    return await h.recordWrites(() => actions.recordLineageAction(form))
  }

  it('says a child that is not a new parcel ID names the shape the picker accepts', async () => {
    const { value, written } = await attempt({ children: `FSC-NEW-1 ${freshId()}` })
    expect(value).toEqual(
      refuseField(
        'children',
        'FSC-NEW-1 is not an existing parcel, and it is not a new parcel ID in the right shape. Map-lot ID: exactly 12 digits, counting leading zeros.',
      ),
    )
    expect(written).toEqual([])
  })

  it('accepts a child ID in the display shape that is not in the layer yet', async () => {
    expect((await attempt({})).value).toEqual({ ok: true, message: 'Lineage event recorded.' })
  })

  it('names a parent that does not exist beside the parents', async () => {
    expect((await attempt({ parents: '999999999999' })).value).toEqual(
      refuseField('parents', 'No parcel found for 999999999999.'),
    )
  })
})

describeActionCases(h, 'createAliasOverrideAction', {
  invoke: actions.createAliasOverrideAction,
  actor: staff,
  input: async () => ({
    format: 'gis12',
    value: freshId(),
    parcelRef: await freshParcel(),
    reason: 'Assessor typo',
  }),
  fields: {
    format: text({ required: true, max: 100 }),
    value: text({ required: true, max: 100 }),
    parcelRef: text({ max: 200 }),
    parcelId: uuid(),
    reason: text({ required: true, max: 1000 }),
    expiresOn: date({ earliest: today }),
  },
  capability: 'parcel.manage',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalFor({
      format: textCopy('an ID format', 100),
      value: textCopy('the ID', 100),
      parcelRef: 'Enter a parcel of 200 characters or fewer.',
      parcelId: 'Choose a parcel from the list.',
      reason: textCopy('a reason', 1000),
      expiresOn: {
        impossible_date: 'Enter the expiry date as a date.',
        words: 'Enter the expiry date as a date.',
        otherwise: `Enter the expiry date between ${formatCivilDate(today)} and December 31, 2099.`,
      },
    }),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { db, written }) => {
    expect(result).toEqual({ ok: true, message: 'Override saved.' })
    expect(written).toEqual(['alias_overrides', 'audit_log', 'parcel_aliases'])
    expect((await db.select().from(aliasOverrides)).length).toBeGreaterThan(0)
  },
})

describe('createAliasOverrideAction parcel and shape', () => {
  const attempt = async (patch: Record<string, string>) => {
    h.signIn(await staff())
    const form = h.form({
      format: 'gis12',
      value: freshId(),
      parcelRef: await freshParcel(),
      reason: 'Assessor typo',
      ...patch,
    })
    return await h.recordWrites(() => actions.createAliasOverrideAction(form))
  }

  it('asks for a parcel beside the parcel when neither a reference nor a record is given', async () => {
    expect((await attempt({ parcelRef: '' })).value).toEqual(
      refuseField('parcelRef', 'Choose a parcel.'),
    )
  })

  it('says a parcel that is not found must be chosen from the list, beside the parcel', async () => {
    expect((await attempt({ parcelRef: '999999999999' })).value).toEqual(
      refuseField('parcelRef', 'Choose a parcel from the list.'),
    )
  })

  it('names the format a value must match, beside the value', async () => {
    expect((await attempt({ format: 'cama15', value: '12345' })).value).toEqual(
      refuseField(
        'value',
        'The ID does not match the selected format. CAMA number: exactly 15 digits, counting leading zeros.',
      ),
    )
  })
})

const lineageWorld = async () => {
  const parent = await freshParcel()
  const childA = await freshParcel()
  const childB = await freshParcel()
  const event = await recordLineageEvent(
    h.db,
    await staff(),
    {
      kind: 'subdivision',
      effectiveDate: '2026-01-10' as CivilDate,
      effectiveBasis: 'recording',
      parents: [parent],
      children: [childA, childB],
    },
    signal,
    RECORDS_NOW,
  )
  if (!event.ok) throw new Error(`lineage ${event.error}`)
  const [link] = await h.db
    .insert(parcelRecordLinks)
    .values({
      recordKind: 'document',
      recordId: crypto.randomUUID(),
      parcelId: parent,
      status: 'linked',
      linkedVia: 'direct',
    })
    .returning({ id: parcelRecordLinks.id })
  return { linkId: link?.id ?? '', childA, other: await freshParcel() }
}

describe('carryForwardAction', () => {
  let world: Awaited<ReturnType<typeof lineageWorld>>
  beforeAll(async () => {
    vi.useRealTimers()
    world = await lineageWorld()
    vi.useFakeTimers({ toFake: ['Date'], now: RECORDS_NOW })
  })

  describeActionCases(h, 'carryForwardAction', {
    invoke: actions.carryForwardAction,
    actor: staff,
    input: () => ({ linkId: world.linkId, toParcelId: world.childA }),
    fields: { linkId: uuid({ required: true }), toParcelId: uuid({ required: true }) },
    capability: 'parcel.manage',
    refusals: {
      ...STAFF_REFUSALS,
      invalid: refusalFor({ linkId: 'Choose a record.', toParcelId: 'Choose a parcel.' }),
      checkOnly: CHECK_PASSED,
    },
    accepted: async (result, { db, written }) => {
      expect(result).toEqual({ ok: true, message: 'Record carried forward.' })
      expect(written).toEqual(['audit_log', 'parcel_record_carry_forwards'])
      const rows = await db
        .select()
        .from(parcelRecordCarryForwards)
        .where(eq(parcelRecordCarryForwards.linkId, world.linkId))
      expect(rows).toHaveLength(1)
    },
  })

  it('refuses a parcel that is not a descendant, beside the parcel', async () => {
    h.signIn(await staff())
    const form = h.form({ linkId: world.linkId, toParcelId: world.other })
    expect(await actions.carryForwardAction(form)).toEqual(
      refuseField('toParcelId', 'That parcel is not a descendant of the record parcel.'),
    )
  })
})

const unresolvedLink = async () => {
  const [link] = await h.db
    .insert(parcelRecordLinks)
    .values({
      recordKind: 'document',
      recordId: crypto.randomUUID(),
      rawRefFormat: 'gis12',
      rawRefValue: freshId(),
      status: 'unresolved',
    })
    .returning({ id: parcelRecordLinks.id })
  return link?.id ?? ''
}

describeActionCases(h, 'resolveUnresolvedAction', {
  invoke: actions.resolveUnresolvedAction,
  actor: staff,
  input: async () => ({ linkId: await unresolvedLink(), parcelRef: await freshParcel() }),
  fields: {
    linkId: uuid({ required: true }),
    parcelRef: text({ required: true, max: 200 }),
  },
  capability: 'parcel.manage',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalFor({
      linkId: 'Choose a record.',
      parcelRef: textCopy('a parcel', 200),
    }),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { db, input, written }) => {
    expect(result).toEqual({ ok: true, message: 'Record linked.' })
    expect(written).toEqual(['audit_log', 'parcel_record_links'])
    const [row] = await db
      .select()
      .from(parcelRecordLinks)
      .where(eq(parcelRecordLinks.id, input.linkId))
    expect(row).toMatchObject({ status: 'linked', parcelId: input.parcelRef })
  },
})

describe('resolveUnresolvedAction parcel', () => {
  it('says a parcel that is not found must be chosen from the list, and links nothing', async () => {
    h.signIn(await staff())
    const form = h.form({ linkId: await unresolvedLink(), parcelRef: '999999999999' })
    const { value, written } = await h.recordWrites(() => actions.resolveUnresolvedAction(form))
    expect(value).toEqual(refuseField('parcelRef', 'Choose a parcel from the list.'))
    expect(written).toEqual([])
  })
})
