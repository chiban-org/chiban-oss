import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { NH_PARCEL_ID_FORMATS } from '@packs/nh/parcelIdFormats'
import { eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { aliasOverrides, gisLayers, parcelIdFormats, parcelRecordLinks, parcels } from '@/db/schema'
import { type Actor, loadActor } from '@/features/auth/actor'
import { DEMO_DOMAIN } from '@/features/demo/domain'
import type { LayerKey } from '@/features/gis/exceptionKinds'
import { runImport } from '@/features/gis/import/runImport'
import type { SourceFeature } from '@/features/gis/import/types'
import { createAliasOverride } from '@/features/parcels/aliasOverrides'
import { createParcelPlaceholder, recordLineageEvent } from '@/features/parcels/lineage'
import { linkRecordByRawRef } from '@/features/parcels/recordLinks'
import { resolveParcelId } from '@/features/parcels/resolveParcelId'
import type { CivilDate } from '@/types/civilDate'

export const DEMO_SEED_NOW = new Date('2026-06-01T12:00:00Z')

const PARCEL_MAPPING = {
  primaryId: { field: 'MAPLOT', format: 'gis12', padNumeric: false },
  extraIds: [
    { field: 'CAMA', format: 'cama15', padNumeric: false },
    { field: 'CAMA_2', format: 'cama15', padNumeric: false },
    { field: 'CAMA_3', format: 'cama15', padNumeric: false },
  ],
  siteAddress: { fields: ['SITE_ADDR'] },
  ownerName: 'OWNER',
  mailingAddress: { fields: ['MAIL_ADDR'] },
}

const LAYER_FILES: { key: LayerKey; file: string; mapping: object }[] = [
  { key: 'parcels', file: 'alder-pond-parcels.geojson', mapping: PARCEL_MAPPING },
  {
    key: 'roads',
    file: 'alder-pond-roads.geojson',
    mapping: { sourceKey: 'ROAD_ID', name: 'NAME' },
  },
  {
    key: 'water',
    file: 'alder-pond-water.geojson',
    mapping: { sourceKey: 'WATER_ID', name: 'NAME' },
  },
]

const UNRESOLVED_RECORD_ID = '00000000-0000-4000-8000-0000000000a1'
const HELD_OWNER_PARCEL = '007005000000'
const SUBDIVIDED_PARENT = '007020000000'
const CHILD_IDS = ['007020001000', '007020002000'] as const

function readFeatures(file: string): SourceFeature[] {
  const raw = readFileSync(fileURLToPath(new URL(`./fixtures/${file}`, import.meta.url)), 'utf8')
  return (JSON.parse(raw) as GeoJSON.FeatureCollection).features.map((f, i) => ({
    rowRef: String(i),
    properties: f.properties ?? {},
    geometry: f.geometry,
  }))
}

async function parcelIdOf(db: Db, value: string, signal: AbortSignal): Promise<string> {
  const found = await resolveParcelId(db, { format: 'gis12', value }, signal)
  return found.ok ? found.value.parcelId : ''
}

interface SeedContext {
  db: Db
  actor: Actor
  importer: { kind: 'user'; userId: string }
  signal: AbortSignal
}

async function importLayers(c: SeedContext): Promise<boolean> {
  let imported = false
  for (const layer of LAYER_FILES) {
    const [row] = await c.db.select().from(gisLayers).where(eq(gisLayers.key, layer.key))
    if (row?.lastSuccessAt != null) continue
    await c.db.update(gisLayers).set({ mapping: layer.mapping }).where(eq(gisLayers.key, layer.key))
    const features = readFeatures(layer.file)
    const input = { layerKey: layer.key, adapter: 'file_geojson', features, fullLayer: true }
    const result = await runImport(c.db, c.importer, input, c.signal)
    imported = imported || result.ok
    if (layer.key === 'parcels' && result.ok) await importHeldOwnerChange(c, layer.file)
  }
  return imported
}

async function importHeldOwnerChange(c: SeedContext, file: string): Promise<void> {
  const held = readFeatures(file).filter((f) => f.properties.MAPLOT === HELD_OWNER_PARCEL)
  for (const f of held) f.properties.OWNER = 'Whitlow, Dara'
  const input = {
    layerKey: 'parcels' as const,
    adapter: 'file_geojson',
    features: held,
    fullLayer: false,
  }
  await runImport(c.db, c.importer, input, c.signal)
}

async function seedSubdivision(c: SeedContext): Promise<void> {
  const parent = await parcelIdOf(c.db, SUBDIVIDED_PARENT, c.signal)
  if (parent === '') return
  const [row] = await c.db.select().from(parcels).where(eq(parcels.id, parent))
  if (row?.status !== 'active') return
  const children: string[] = []
  for (const value of CHILD_IDS) {
    const created = await createParcelPlaceholder(
      c.db,
      c.actor,
      { aliases: [{ format: 'gis12', value }] },
      c.signal,
    )
    if (created.ok) children.push(created.value.parcelId)
  }
  await recordLineageEvent(
    c.db,
    c.actor,
    {
      kind: 'subdivision',
      effectiveDate: '2026-04-12' as CivilDate,
      effectiveBasis: 'recording',
      reference: 'Plan book 14, page 7',
      parents: [parent],
      children,
    },
    c.signal,
    DEMO_SEED_NOW,
  )
}

async function seedOverride(c: SeedContext): Promise<void> {
  const condo = await parcelIdOf(c.db, '007014000000', c.signal)
  const existing = await c.db.select().from(aliasOverrides)
  if (condo === '' || existing.length > 0) return
  await createAliasOverride(
    c.db,
    c.actor,
    {
      format: 'cama15',
      value: '005014000000000',
      parcelId: condo,
      reason: 'Folder label uses old map number',
    },
    c.signal,
  )
}

async function seedUnresolvedRecord(c: SeedContext): Promise<void> {
  const links = await c.db
    .select()
    .from(parcelRecordLinks)
    .where(eq(parcelRecordLinks.recordId, UNRESOLVED_RECORD_ID))
  if (links.length > 0) return
  await c.db.transaction((tx) =>
    linkRecordByRawRef(
      tx,
      {
        recordKind: 'demo_record',
        recordId: UNRESOLVED_RECORD_ID,
        format: 'gis12',
        value: '008099000000',
      },
      c.signal,
    ),
  )
}

export async function seedParcels(db: Db, signal: AbortSignal): Promise<{ imported: boolean }> {
  signal.throwIfAborted()
  await db
    .insert(parcelIdFormats)
    .values(NH_PARCEL_ID_FORMATS.map(({ example: _example, ...format }) => format))
    .onConflictDoNothing()
  const staff = await db.query.users.findFirst({
    where: (u, { eq: same }) => same(u.email, `staff@${DEMO_DOMAIN}`),
  })
  const actor = staff === undefined ? null : await loadActor(db, staff.id, signal)
  if (actor === null) return { imported: false }
  const c: SeedContext = { db, actor, importer: { kind: 'user', userId: actor.userId }, signal }
  const imported = await importLayers(c)
  await seedSubdivision(c)
  await seedOverride(c)
  await seedUnresolvedRecord(c)
  return { imported }
}
