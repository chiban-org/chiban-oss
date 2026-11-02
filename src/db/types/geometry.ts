import { sql } from 'drizzle-orm'
import { customType } from 'drizzle-orm/pg-core'
import wkx from 'wkx'

interface GeometryOptions {
  type: 'MultiPolygon' | 'Geometry'
  srid: 4326
}

function fromEwkbHex(value: string): GeoJSON.Geometry {
  return wkx.Geometry.parse(Buffer.from(value, 'hex')).toGeoJSON() as GeoJSON.Geometry
}

export function geometryColumn(name: string, opts: GeometryOptions) {
  return customType<{ data: GeoJSON.Geometry; driverData: string; config: GeometryOptions }>({
    dataType() {
      return `geometry(${opts.type}, ${opts.srid})`
    },
    toDriver(value) {
      return sql`ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(value)}), ${sql.raw(String(opts.srid))})`
    },
    fromDriver(value) {
      return fromEwkbHex(value)
    },
  })(name)
}
