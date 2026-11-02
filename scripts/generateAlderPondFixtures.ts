import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  buildLots,
  parcelFeatures,
  roadFeatures,
  waterFeatures,
} from '../src/test/fixtureBuilders/alderPondGrid.ts'
import { writeEsriFixtures } from '../src/test/fixtureBuilders/esriFixtureWriter.ts'
import { buildGeoPackage } from '../src/test/fixtureBuilders/geopackageWriter.ts'
import { buildShapefileZip } from '../src/test/fixtureBuilders/shapefileWriter.ts'

const TEST_DIR = path.resolve('src/test/fixtures/gis')
const DEMO_DIR = path.resolve('src/features/demo/fixtures')

function collection(features: GeoJSON.Feature[]): string {
  return `${JSON.stringify({ type: 'FeatureCollection', features })}\n`
}

mkdirSync(TEST_DIR, { recursive: true })
mkdirSync(DEMO_DIR, { recursive: true })
writeFileSync(path.join(TEST_DIR, 'alder-pond-parcels.geojson'), collection(parcelFeatures(false)))
writeFileSync(
  path.join(TEST_DIR, 'alder-pond-parcels-dirty.geojson'),
  collection(parcelFeatures(true)),
)
writeFileSync(path.join(TEST_DIR, 'alder-pond-roads.geojson'), collection(roadFeatures()))
writeFileSync(path.join(TEST_DIR, 'alder-pond-water.geojson'), collection(waterFeatures()))
writeFileSync(path.join(TEST_DIR, 'alder-pond-stateplane.zip'), buildShapefileZip(buildLots()))
writeFileSync(path.join(TEST_DIR, 'alder-pond.gpkg'), buildGeoPackage(buildLots()))
writeFileSync(path.join(DEMO_DIR, 'alder-pond-parcels.geojson'), collection(parcelFeatures(false)))
writeFileSync(path.join(DEMO_DIR, 'alder-pond-roads.geojson'), collection(roadFeatures()))
writeFileSync(path.join(DEMO_DIR, 'alder-pond-water.geojson'), collection(waterFeatures()))
writeEsriFixtures(path.join(TEST_DIR, 'esri'), 'Parcels')
writeEsriFixtures(path.join(TEST_DIR, 'axisgis'), 'TaxParcels')
