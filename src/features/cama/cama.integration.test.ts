import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { auditLog, gisLayers, importExceptions, parcelAliases, parcels } from '@/db/schema'
import { acceptHeldRow } from '@/features/gis/import/exceptions'
import { getLayerStatus } from '@/features/gis/layerStatus'
import { getPublicParcelView } from '@/features/parcels/publicParcelView'
import { getStaffParcelView } from '@/features/parcels/staffParcelView'
import { buildLots } from '@/test/fixtureBuilders/alderPondGrid'
import {
  ACCENTED_OWNER,
  buildCamaCsv,
  camaCsv,
  camaLine,
  rowForLot,
} from '@/test/fixtureBuilders/camaFixture'
import { makeParcel } from '@/test/parcels'
import {
  bytes,
  type CamaWorld,
  fixture,
  lotAt,
  parcelFor,
  runCama,
  setupCamaWorld,
} from '@/test/testHarness/cama'

const signal = new AbortController().signal
let world: CamaWorld

beforeEach(async () => {
  world = await setupCamaWorld()
})
afterEach(async () => {
  await world.handle.drop()
})

async function heldRows() {
  return await world.handle.db
    .select()
    .from(importExceptions)
    .where(eq(importExceptions.kind, 'owner_changed'))
}

describe('CAMA import', () => {
  it('first run fills owners on 36 seeded parcels', async () => {
    const report = await runCama(world, fixture('alder-pond-cama.csv'))
    expect(report).toMatchObject({
      countIn: 36,
      countApplied: 36,
      countExcepted: 0,
      countCreated: 0,
    })
    const rows = await world.handle.db.select().from(parcels)
    expect(rows).toHaveLength(36)
    expect(rows.every((r) => r.ownerName !== null && r.mailingAddress !== null)).toBe(true)
    const first = await parcelFor(world, '007001000000')
    expect(first.ownerName).toBe('Larkspur Family Trust')
    expect(first.mailingAddress).toBe('PO Box 100 Alder Pond NH 03999')
    const [layer] = await world.handle.db.select().from(gisLayers).where(eq(gisLayers.key, 'cama'))
    expect(layer).toMatchObject({ adapter: 'file_cama_csv' })
    expect(layer?.lastSuccessAt).not.toBeNull()
  })

  it('reads the windows-1252 file and keeps the accent', async () => {
    await runCama(world, fixture('alder-pond-cama-1252.csv'))
    expect((await parcelFor(world, '007001000000')).ownerName).toBe(ACCENTED_OWNER)
  })

  it('second identical run is a no-op', async () => {
    await runCama(world, fixture('alder-pond-cama.csv'))
    const auditBefore = await world.handle.db.select().from(auditLog)
    const second = await runCama(world, fixture('alder-pond-cama.csv'))
    expect(second).toMatchObject({ countUnchanged: 36, countApplied: 0, countExcepted: 0 })
    expect(await world.handle.db.select().from(auditLog)).toHaveLength(auditBefore.length)
  })

  it('changed owner is held as owner_changed and nothing in the row changes', async () => {
    await runCama(world, fixture('alder-pond-cama.csv'))
    const before = await parcelFor(world, '007005000000')
    const changed = camaCsv([camaLine(rowForLot(lotAt(4), 'Newcomer Holdings LLC'))])
    const report = await runCama(world, bytes(changed), false)
    expect(report).toMatchObject({ countExcepted: 1, countApplied: 0 })
    expect(report.exceptionsByKind.owner_changed).toBe(1)
    expect(await parcelFor(world, '007005000000')).toEqual(before)
    const held = await heldRows()
    expect(held).toHaveLength(1)
    expect(held[0]?.layerKey).toBe('cama')
  })

  it('accepting a held CAMA row changes the owner and keeps the geometry', async () => {
    await runCama(world, fixture('alder-pond-cama.csv'))
    const before = await parcelFor(world, '007005000000')
    const changed = camaCsv([camaLine(rowForLot(lotAt(4), 'Newcomer Holdings LLC'))])
    await runCama(world, bytes(changed), false)
    const [held] = await heldRows()
    const accepted = await acceptHeldRow(world.handle.db, world.staff, held?.id ?? '', signal)
    expect(accepted.ok).toBe(true)
    const after = await parcelFor(world, '007005000000')
    expect(after.ownerName).toBe('Newcomer Holdings LLC')
    expect(after.geom).toEqual(before.geom)
    expect(after.mailingAddress).toBe(before.mailingAddress)
  })

  it('a blank owner in the file never blanks a stored owner', async () => {
    await runCama(world, fixture('alder-pond-cama.csv'))
    const blank = camaLine({ ...rowForLot(lotAt(2)), owner1: '' })
    const report = await runCama(world, bytes(camaCsv([blank])), false)
    expect(report).toMatchObject({ countUnchanged: 1, countExcepted: 0 })
    expect((await parcelFor(world, '007003000000')).ownerName).toBe('Quillfeather, Odessa')
  })

  it('a changed site address is applied and audited', async () => {
    await runCama(world, fixture('alder-pond-cama.csv'))
    const site = { number: '99', street: 'Heron Cove Road' }
    const moved = camaLine({ ...rowForLot(lotAt(0)), site })
    const report = await runCama(world, bytes(camaCsv([moved])), false)
    expect(report).toMatchObject({ countApplied: 1 })
    const row = await parcelFor(world, '007001000000')
    expect(row.siteAddress).toBe('99 Heron Cove Road')
    const audits = await world.handle.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityId, row.id))
    expect(audits.some((a) => a.action === 'parcel.import_update')).toBe(true)
  })

  it('unknown cama id is cama_parcel_unknown and no parcel is created', async () => {
    const unknown = camaCsv([camaLine({ ...rowForLot(lotAt(0)), gis12: '099001000000' })])
    const report = await runCama(world, bytes(unknown), false)
    expect(report.exceptionsByKind.cama_parcel_unknown).toBe(1)
    expect(await world.handle.db.select().from(parcels)).toHaveLength(36)
  })

  it('a five-digit lot becomes id_format_mismatch', async () => {
    const bad = camaCsv(['7,14000,0,0,Someone,,PO Box 1,,Alder Pond,NH,03999,12,Heron Cove Road'])
    const report = await runCama(world, bytes(bad), false)
    expect(report.exceptionsByKind.id_format_mismatch).toBe(1)
  })

  it('a retired cama id is id_resolves_to_retired', async () => {
    await makeParcel(world.handle.db, [
      { format: 'cama15', value: '005001000000000', status: 'retired' },
    ])
    const retired = camaCsv([camaLine({ ...rowForLot(lotAt(0)), gis12: '005001000000' })])
    const report = await runCama(world, bytes(retired), false)
    expect(report.exceptionsByKind.id_resolves_to_retired).toBe(1)
  })

  it('condo unit ids resolve to the one condo parcel', async () => {
    const condo = lotAt(13)
    const lines = ['001', '002', '003'].map((unit) => camaLine({ ...rowForLot(condo), unit }))
    const report = await runCama(world, bytes(camaCsv(lines)), false)
    expect(report).toMatchObject({
      countIn: 3,
      countApplied: 1,
      countUnchanged: 2,
      countExcepted: 0,
    })
    const condoRow = await parcelFor(world, condo.gis12)
    const aliases = await world.handle.db
      .select({ parcelId: parcelAliases.parcelId })
      .from(parcelAliases)
      .where(eq(parcelAliases.format, 'cama15'))
    expect(aliases.filter((a) => a.parcelId === condoRow.id)).toHaveLength(3)
    expect(condoRow.ownerName).toBe(condo.owner)
  })

  it('a full file reports every active cama id missing from it, and a partial file none', async () => {
    const lines = buildLots()
      .slice(0, 35)
      .map((lot) => camaLine(rowForLot(lot)))
    const full = await runCama(world, bytes(camaCsv(lines)), true)
    expect(full.countMissingFromLayer).toBe(3)
    const partial = await runCama(world, bytes(camaCsv(lines)), false)
    expect(partial.countMissingFromLayer).toBe(0)
  })

  it('leaves parcel geometry alone', async () => {
    const before = await parcelFor(world, '007001000000')
    await runCama(world, fixture('alder-pond-cama.csv'))
    expect((await parcelFor(world, '007001000000')).geom).toEqual(before.geom)
  })

  it('the filled owner and mailing address are what the staff and public views read', async () => {
    await runCama(world, fixture('alder-pond-cama.csv'))
    const row = await parcelFor(world, '007001000000')
    const now = new Date()
    const staffView = await getStaffParcelView(world.handle.db, world.staff, row.id, now, signal)
    const publicView = await getPublicParcelView(world.handle.db, row.id, now, signal)
    if (!staffView.ok || !publicView.ok) throw new Error('views failed')
    expect(staffView.value.owner).toMatchObject({ state: 'known', value: 'Larkspur Family Trust' })
    expect(staffView.value.mailingAddress).toMatchObject({
      state: 'known',
      value: 'PO Box 100 Alder Pond NH 03999',
    })
    expect(publicView.value.owner).toMatchObject({ state: 'known', value: 'Larkspur Family Trust' })
  })

  it('layer status for cama shows stale after its threshold', async () => {
    await world.handle.db
      .update(gisLayers)
      .set({ lastSuccessAt: new Date('2027-01-01T15:00:00Z'), staleAfterDays: 30 })
      .where(eq(gisLayers.key, 'cama'))
    const early = new Date('2027-01-20T15:00:00Z')
    const late = new Date('2027-03-01T15:00:00Z')
    expect((await getLayerStatus(world.handle.db, 'cama', early, signal)).state).toBe('fresh')
    expect((await getLayerStatus(world.handle.db, 'cama', late, signal)).state).toBe('stale')
  })

  it('the checked-in fixture matches its builder', () => {
    expect(Buffer.from(fixture('alder-pond-cama.csv')).toString('utf8')).toBe(buildCamaCsv(false))
  })
})
