import proj4 from 'proj4'

export const NH_STATE_PLANE_FEET_PROJ4 =
  '+proj=tmerc +lat_0=42.5 +lon_0=-71.66666666666667 +k=0.999966667 +x_0=300000.0000000001 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=us-ft +no_defs'

export const NH_STATE_PLANE_FEET_WKT =
  'PROJCS["NAD_1983_StatePlane_New_Hampshire_FIPS_2800_Feet",GEOGCS["GCS_North_American_1983",DATUM["D_North_American_1983",SPHEROID["GRS_1980",6378137.0,298.257222101]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",984250.0],PARAMETER["False_Northing",0.0],PARAMETER["Central_Meridian",-71.66666666666667],PARAMETER["Scale_Factor",0.999966667],PARAMETER["Latitude_Of_Origin",42.5],UNIT["Foot_US",0.3048006096012192]]'

export const ORIGIN_FT = { x: 1_000_000, y: 500_000 } as const
export const LOT_WIDTH_FT = 200
export const LOT_HEIGHT_FT = 300
export const GRID_COLS = 6
export const GRID_ROWS = 6
export const CONDO_INDEX = 13

const STREETS = [
  'Heron Cove Road',
  'Alder Pond Road',
  'Larkspur Lane',
  'Willow Bend',
  'Birch Hollow Road',
  'Tamarack Way',
] as const

const OWNERS = [
  'Larkspur Family Trust',
  'Marsh Wren Holdings LLC',
  'Quillfeather, Odessa',
  'Bramblewick, Tobias and Ione',
  'Pennywhistle Land Company',
  'Thistledown, Calla',
  'Hollowell Cranberry Trust',
  'Fenwick, Rowan',
  'Sedgewater Properties LLC',
  'Mossgrove, Linden and Pia',
  'Kestrel Ridge Partners',
  'Dunnock, Wilhelmina',
] as const

export type Ring = [number, number][]

export interface GridLot {
  index: number
  gis12: string
  cama: string[]
  siteAddress: string
  number: string
  street: string
  owner: string
  mailing: string
  ringFt: Ring
}

export function gis12For(index: number): string {
  const map = index < 30 ? '007' : '008'
  const lot = index < 30 ? index + 1 : index - 29
  return `${map}${String(lot).padStart(3, '0')}000000`
}

export function buildLots(): GridLot[] {
  const lots: GridLot[] = []
  for (let index = 0; index < GRID_COLS * GRID_ROWS; index += 1) {
    const col = index % GRID_COLS
    const row = Math.floor(index / GRID_COLS)
    const x = ORIGIN_FT.x + col * LOT_WIDTH_FT
    const y = ORIGIN_FT.y + row * LOT_HEIGHT_FT
    const gis12 = gis12For(index)
    const number = String(12 + 2 * col)
    const street = STREETS[row] ?? STREETS[0]
    lots.push({
      index,
      gis12,
      cama: index === CONDO_INDEX ? [`${gis12}001`, `${gis12}002`, `${gis12}003`] : [`${gis12}000`],
      number,
      street,
      siteAddress: `${number} ${street}`,
      owner: OWNERS[index % OWNERS.length] ?? OWNERS[0],
      mailing: `PO Box ${100 + index}, Alder Pond NH`,
      ringFt: [
        [x, y],
        [x + LOT_WIDTH_FT, y],
        [x + LOT_WIDTH_FT, y + LOT_HEIGHT_FT],
        [x, y + LOT_HEIGHT_FT],
        [x, y],
      ],
    })
  }
  return lots
}

export function toLonLat(pointFt: [number, number]): [number, number] {
  const [lon = 0, lat = 0] = proj4(NH_STATE_PLANE_FEET_PROJ4, 'EPSG:4326', pointFt)
  return [Number(lon.toFixed(9)), Number(lat.toFixed(9))]
}

export function ringToLonLat(ring: Ring): Ring {
  return ring.map(toLonLat)
}

export function bowtie(ring: Ring): Ring {
  const [a, b, c, d, e] = ring
  if (a === undefined || b === undefined || c === undefined || d === undefined || e === undefined)
    return ring
  return [a, c, b, d, e]
}

export function parcelProperties(lot: GridLot): Record<string, string | null> {
  return {
    MAPLOT: lot.gis12,
    CAMA: lot.cama[0] ?? null,
    CAMA_2: lot.cama[1] ?? null,
    CAMA_3: lot.cama[2] ?? null,
    SITE_NUM: lot.number,
    SITE_STREET: lot.street,
    SITE_ADDR: lot.siteAddress,
    OWNER: lot.owner,
    MAIL_ADDR: lot.mailing,
  }
}

export function roadFeatures(): GeoJSON.Feature<GeoJSON.LineString>[] {
  return Array.from({ length: GRID_ROWS + 1 }, (_, r) => {
    const y = ORIGIN_FT.y + r * LOT_HEIGHT_FT
    const line: [number, number][] = [
      [ORIGIN_FT.x - 100, y],
      [ORIGIN_FT.x + GRID_COLS * LOT_WIDTH_FT + 100, y],
    ]
    return {
      type: 'Feature',
      properties: { ROAD_ID: `R${r + 1}`, NAME: STREETS[Math.min(r, GRID_ROWS - 1)] ?? 'Road' },
      geometry: { type: 'LineString', coordinates: line.map(toLonLat) },
    }
  })
}

export function waterFeatures(): GeoJSON.Feature<GeoJSON.Polygon>[] {
  const x = ORIGIN_FT.x + GRID_COLS * LOT_WIDTH_FT + 200
  const y = ORIGIN_FT.y
  const ring: Ring = [
    [x, y],
    [x + 400, y],
    [x + 400, y + 600],
    [x, y + 600],
    [x, y],
  ]
  return [
    {
      type: 'Feature',
      properties: { WATER_ID: 'W1', NAME: 'Alder Pond' },
      geometry: { type: 'Polygon', coordinates: [ringToLonLat(ring)] },
    },
  ]
}

export function parcelFeatures(dirty: boolean): GeoJSON.Feature<GeoJSON.Polygon>[] {
  return buildLots().map((lot) => {
    const ring = dirty && lot.index === GRID_COLS * GRID_ROWS - 1 ? bowtie(lot.ringFt) : lot.ringFt
    return {
      type: 'Feature',
      properties: parcelProperties(lot),
      geometry: { type: 'Polygon', coordinates: [ringToLonLat(ring)] },
    }
  })
}
