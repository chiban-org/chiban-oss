import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parcelFeatures } from './alderPondGrid.ts'

const MAX_RECORD_COUNT = 15
const OBJECT_ID_FIELD = 'OBJECTID'

function metadata(name: string) {
  return {
    currentVersion: 10.91,
    name,
    type: 'Feature Layer',
    geometryType: 'esriGeometryPolygon',
    objectIdField: OBJECT_ID_FIELD,
    maxRecordCount: MAX_RECORD_COUNT,
    fields: [
      { name: OBJECT_ID_FIELD, type: 'esriFieldTypeOID' },
      { name: 'MAPLOT', type: 'esriFieldTypeString' },
      { name: 'CAMA', type: 'esriFieldTypeString' },
      { name: 'SITE_ADDR', type: 'esriFieldTypeString' },
      { name: 'OWNER', type: 'esriFieldTypeString' },
      { name: 'MAIL_ADDR', type: 'esriFieldTypeString' },
    ],
  }
}

export function writeEsriFixtures(dir: string, layerName: string): void {
  mkdirSync(dir, { recursive: true })
  const features = parcelFeatures(false).map((f, i) => ({
    ...f,
    properties: { ...f.properties, [OBJECT_ID_FIELD]: i + 1 },
  }))
  writeFileSync(path.join(dir, 'metadata.json'), `${JSON.stringify(metadata(layerName))}\n`)
  for (let page = 0; page * MAX_RECORD_COUNT < features.length; page += 1) {
    const slice = features.slice(page * MAX_RECORD_COUNT, (page + 1) * MAX_RECORD_COUNT)
    const more = (page + 1) * MAX_RECORD_COUNT < features.length
    const body = {
      type: 'FeatureCollection',
      features: slice,
      ...(more ? { exceededTransferLimit: true } : {}),
    }
    writeFileSync(path.join(dir, `page-${page}.json`), `${JSON.stringify(body)}\n`)
  }
}
