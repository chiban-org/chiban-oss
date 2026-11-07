import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { gisLayers } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { BOARD_SETTINGS_DEFAULT, boardSettingsDefault } from '@/features/boards/boardSettingsSchema'
import { scheduleMeeting } from '@/features/boards/meetings'
import { activeBoards, boardIdOf } from '@/features/boards/townBoards'
import { publishNewVersion } from '@/features/config/publish'
import { must } from '@/features/demo/seedPermitSupport'
import type { LayerKey } from '@/features/gis/exceptionKinds'
import { runImport } from '@/features/gis/import/runImport'
import type { SourceFeature } from '@/features/gis/import/types'
import { upsertAssociation } from '@/features/rosters/associations'
import { upsertPark } from '@/features/rosters/parks'
import { addRestriction } from '@/features/rosters/restrictions'
import { recordRosterReview } from '@/features/rosters/reviews'
import type { CivilDate } from '@/types/civilDate'

const d = (s: string) => s as CivilDate

const PB_MEETINGS = [
  '2026-07-08',
  '2026-07-22',
  '2026-08-12',
  '2026-08-26',
  '2026-09-09',
  '2026-09-23',
  '2026-10-14',
  '2026-10-28',
  '2026-11-12',
  '2026-11-25',
  '2026-12-09',
  '2027-01-13',
]
const ZBA_MEETINGS = ['2026-04-15', '2026-10-20', '2026-11-17', '2026-12-15', '2027-01-19']

const PARCEL_MAPPING = {
  primaryId: { field: 'MAPLOT', format: 'gis12', padNumeric: false },
  extraIds: [{ field: 'CAMA', format: 'cama15', padNumeric: false }],
  siteAddress: { fields: ['SITE_ADDR'] },
  ownerName: 'OWNER',
  mailingAddress: { fields: ['MAIL_ADDR'] },
}

const SCENARIO_LAYERS: { key: LayerKey; file: string; mapping: object }[] = [
  { key: 'parcels', file: 'abutter-parcels.geojson', mapping: PARCEL_MAPPING },
  { key: 'roads', file: 'abutter-roads.geojson', mapping: { sourceKey: 'ROAD_ID', name: 'NAME' } },
  { key: 'water', file: 'abutter-water.geojson', mapping: { sourceKey: 'WATER_ID', name: 'NAME' } },
]

function readFeatures(file: string): SourceFeature[] {
  const raw = readFileSync(fileURLToPath(new URL(`./fixtures/${file}`, import.meta.url)), 'utf8')
  return (JSON.parse(raw) as GeoJSON.FeatureCollection).features.map((f, i) => ({
    rowRef: String(i),
    properties: f.properties ?? {},
    geometry: f.geometry,
  }))
}

export const DEMO_CONTACTS = {
  key: 'default',
  commission: {
    name: 'Alder Valley Regional Planning Commission',
    mailingAddress: '18 Commission Way, Alder Valley NH 03999',
  },
  municipalities: [
    {
      key: 'pine_river',
      name: 'Town of Pine River',
      mailingAddress: '4 Town Hall Road, Pine River NH 03000',
    },
    {
      key: 'dunmore',
      name: 'Town of Dunmore',
      mailingAddress: '9 Common Street, Dunmore NH 03001',
    },
  ],
  nhDes: {
    name: 'NH Department of Environmental Services',
    mailingAddress: '1 Example Way, Concord NH 03301',
  },
}

export async function publishBoardConfig(db: Db, admin: Actor, signal: AbortSignal) {
  const settings = {
    ...boardSettingsDefault(await activeBoards(db)),
    abutters: {
      ...BOARD_SETTINGS_DEFAULT.abutters,
      projectionEnabled: true,
      layersConfirmedBy: 'Land Use Technician',
      layersConfirmedOn: '2026-10-01',
    },
  }
  for (const input of [
    { kind: 'board_settings' as const, key: 'default', body: settings },
    { kind: 'regional_contacts' as const, key: 'default', body: DEMO_CONTACTS },
  ]) {
    const published = await db.transaction((tx) =>
      publishNewVersion(tx, admin, input, 'config.publish', signal),
    )
    must(published, `publish ${input.kind}`)
  }
}

export async function scheduleBoardMeetings(db: Db, staff: Actor, signal: AbortSignal) {
  for (const [board, dates] of [
    ['planning_board', PB_MEETINGS],
    ['zba', ZBA_MEETINGS],
  ] as const) {
    for (const meetingDate of dates) {
      must(
        await scheduleMeeting(
          db,
          staff,
          {
            boardId: await boardIdOf(db, board),
            meetingDate: d(meetingDate),
            kind: 'regular',
            location: 'Alder Pond Town Hall, Meeting Room 2',
          },
          signal,
        ),
        `meeting ${meetingDate}`,
      )
    }
  }
}

export async function importScenarioParcels(db: Db, importer: Actor, signal: AbortSignal) {
  for (const layer of SCENARIO_LAYERS) {
    await db.update(gisLayers).set({ mapping: layer.mapping }).where(eq(gisLayers.key, layer.key))
    const result = await runImport(
      db,
      { kind: 'user', userId: importer.userId },
      {
        layerKey: layer.key,
        adapter: 'file_geojson',
        features: readFeatures(layer.file),
        fullLayer: false,
      },
      signal,
    )
    must(result, `import ${layer.key}`)
  }
}

export async function seedRosters(
  db: Db,
  staff: Actor,
  ids: Record<string, string>,
  reviewedOn: CivilDate,
  signal: AbortSignal,
) {
  must(
    await upsertAssociation(
      db,
      staff,
      {
        parcelId: ids.I2 ?? '',
        associationName: 'Coot Crossing Condominium Association',
        officers: [
          {
            name: 'Dana Whitcomb',
            title: 'President',
            mailingAddress: 'PO Box 105, Alder Pond NH 03999',
          },
          {
            name: 'Lee Marsh',
            title: 'Treasurer',
            mailingAddress: 'PO Box 106, Alder Pond NH 03999',
          },
        ],
        asOf: reviewedOn,
      },
      signal,
    ),
    'association roster',
  )
  must(
    await upsertPark(
      db,
      staff,
      {
        parcelId: ids.E1 ?? '',
        parkName: 'Merganser Court',
        ownerName: 'Merganser Court Holdings LLC',
        ownerMailingAddress: '3 Merganser Court, Alder Pond NH 03999',
        tenants: [
          {
            tenantId: 'site-4',
            name: 'Cass Pryor',
            mailingAddress: '4 Merganser Court, Alder Pond NH 03999',
            siteLabel: 'Site 4',
          },
          {
            tenantId: 'site-7',
            name: 'Ines Thorne',
            mailingAddress: '7 Merganser Court, Alder Pond NH 03999',
            siteLabel: 'Site 7',
          },
        ],
        asOf: reviewedOn,
      },
      signal,
    ),
    'park roster',
  )
  must(
    await addRestriction(
      db,
      staff,
      {
        parcelId: ids.A ?? '',
        holderName: 'Alder Valley Land Trust',
        holderMailingAddress: '2 Trust Lane, Alder Pond NH 03999',
        restrictionKind: 'conservation',
        recordedReference: 'Book 412, Page 88',
      },
      signal,
    ),
    'restriction',
  )
  for (const kind of ['condo', 'park', 'restrictions', 'regional_contacts'] as const) {
    must(await recordRosterReview(db, staff, { kind, reviewedOn }, signal), `review ${kind}`)
  }
}

export const SCENARIO_LOTS: Record<string, number> = {
  A: 1,
  B: 12,
  E1: 13,
  I2: 22,
  M4: 16,
  M6: 17,
}
