import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  parcelFeatures,
  roadCenterlineFeatures,
  roadRightOfWayFeatures,
  waterCenterlineFeatures,
  waterPolygonFeatures,
} from '../src/test/fixtureBuilders/abutterScenario.ts'

const TEST_DIR = path.resolve('src/test/fixtures/gis/abutters')
const DEMO_DIR = path.resolve('src/features/demo/fixtures')

function collection(features: GeoJSON.Feature[]): string {
  return `${JSON.stringify({ type: 'FeatureCollection', features })}\n`
}

mkdirSync(TEST_DIR, { recursive: true })
mkdirSync(DEMO_DIR, { recursive: true })
const files: [string, GeoJSON.Feature[]][] = [
  ['parcels.geojson', parcelFeatures()],
  ['roads-centerline.geojson', roadCenterlineFeatures()],
  ['roads-row.geojson', roadRightOfWayFeatures()],
  ['water-polygon.geojson', waterPolygonFeatures()],
  ['water-centerline.geojson', waterCenterlineFeatures()],
]
for (const [name, features] of files) writeFileSync(path.join(TEST_DIR, name), collection(features))
writeFileSync(path.join(DEMO_DIR, 'abutter-parcels.geojson'), collection(parcelFeatures()))
writeFileSync(path.join(DEMO_DIR, 'abutter-roads.geojson'), collection(roadCenterlineFeatures()))
writeFileSync(path.join(DEMO_DIR, 'abutter-water.geojson'), collection(waterPolygonFeatures()))
