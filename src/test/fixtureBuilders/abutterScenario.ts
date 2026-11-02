import { type Ring, ringToLonLat, toLonLat } from './alderPondGrid.ts'

export const X0 = 1_010_000
export const Y0 = 600_000

type RelPoint = [number, number]

export function abs(point: RelPoint): [number, number] {
  return [X0 + point[0], Y0 + point[1]]
}

export function rectRing(x0: number, x1: number, y0: number, y1: number): Ring {
  return [abs([x0, y0]), abs([x1, y0]), abs([x1, y1]), abs([x0, y1]), abs([x0, y0])]
}

export function polar(centerX: number, angleDeg: number, radius: number): RelPoint {
  const radians = (angleDeg * Math.PI) / 180
  return [centerX + radius * Math.cos(radians), radius * Math.sin(radians)]
}

const KB_CENTER_X = 7000

function arcPoints(from: number, to: number, step: number, radius: number): RelPoint[] {
  const points: RelPoint[] = []
  for (let angle = from; angle <= to + 1e-9; angle += step) {
    points.push(polar(KB_CENTER_X, angle, radius))
  }
  return points
}

function sector(fromDeg: number, toDeg: number, innerR: number, outerR: number): Ring {
  const outer = arcPoints(fromDeg, toDeg, 2.5, outerR)
  const inner = arcPoints(fromDeg, toDeg, 2.5, innerR).reverse()
  const ring = [...outer, ...inner, outer[0] as RelPoint]
  return ring.map(abs)
}

export interface ScenarioParcel {
  name: string
  lot: number
  owner: string
  ringFt: Ring
}

function parcel(name: string, lot: number, owner: string, ringFt: Ring): ScenarioParcel {
  return { name, lot, owner, ringFt }
}

function kingfisherApplicant(): Ring {
  const frontage = arcPoints(200, 230, 2.5, 525)
  const back = [
    polar(KB_CENTER_X, 230, 825),
    polar(KB_CENTER_X, 215, 825),
    polar(KB_CENTER_X, 200, 825),
  ]
  return [...frontage, ...back, frontage[0] as RelPoint].map(abs)
}

export const SCENARIO_PARCELS: ScenarioParcel[] = [
  parcel('A', 1, 'Osprey Point Partners LLC', rectRing(400, 800, -325, -25)),
  parcel('SW', 2, 'Wren, Isolde', rectRing(200, 399.5, -325, -25)),
  parcel('SE', 3, 'Teasel Family Trust', rectRing(800, 1000, -325, -25)),
  parcel('R', 4, 'Rushlight Properties LLC', rectRing(400, 800, -625, -325)),
  parcel('RD', 5, 'Dunlin, Corwin and Edda', rectRing(800, 1000, -625, -325)),
  parcel('W2', 6, 'Plover Ridge Trust', rectRing(100, 397, -625, -325)),
  parcel('N1', 7, 'Cormorant, Alba', rectRing(0, 350.5, 25, 325)),
  parcel('N2', 8, 'Sandpiper Holdings LLC', rectRing(350.5, 470, 25, 325)),
  parcel('N3', 9, 'Ferngully Land Company', rectRing(470, 730, 25, 325)),
  parcel('N4', 10, 'Kittiwake, Bram', rectRing(730, 845, 25, 325)),
  parcel('N5', 11, 'Avocet Family Trust', rectRing(855, 1100, 25, 325)),
  parcel('B', 12, 'Brookside Builders LLC', rectRing(2700, 3000, -200, 0)),
  parcel('E1', 13, 'Dipper, Marisol', rectRing(3030, 3330, -500, -240)),
  parcel('E2', 14, 'Merganser Estates LLC', rectRing(3030, 3330, -240, 100)),
  parcel('E3', 15, 'Teal Hollow Trust', rectRing(3030, 3330, 100, 400)),
  parcel('M4', 16, 'Snipe, Orrin', rectRing(2200, 2600, -200, 0)),
  parcel('M6', 17, 'Bittern Meadow LLC', rectRing(1950, 2350, 300, 600)),
  parcel('P', 18, 'Heron Pond Cottages LLC', rectRing(4700, 5000, -100, 100)),
  parcel('K', 19, 'Kingfisher Bend Developers LLC', kingfisherApplicant()),
  parcel('I0', 20, 'Loon, Perpetua', sector(170, 185, 175, 475)),
  parcel('I1', 21, 'Grebe Family Trust', sector(185, 205, 175, 475)),
  parcel('I2', 22, 'Coot Crossing LLC', sector(205, 225, 175, 475)),
  parcel('I3', 23, 'Egret, Thaddeus', sector(225, 240, 175, 475)),
  parcel('I4', 24, 'Stilt Landing Trust', sector(245, 260, 175, 475)),
]

export function gis12Of(parcel: ScenarioParcel): string {
  return `009${String(parcel.lot).padStart(3, '0')}000000`
}

function polygonFeature(
  properties: Record<string, string | null>,
  ring: Ring,
): GeoJSON.Feature<GeoJSON.Polygon> {
  return {
    type: 'Feature',
    properties,
    geometry: { type: 'Polygon', coordinates: [ringToLonLat(ring)] },
  }
}

function lineFeature(
  properties: Record<string, string | null>,
  path: [number, number][],
): GeoJSON.Feature<GeoJSON.LineString> {
  return {
    type: 'Feature',
    properties,
    geometry: { type: 'LineString', coordinates: path.map(toLonLat) },
  }
}

export function parcelFeatures(): GeoJSON.Feature<GeoJSON.Polygon>[] {
  return SCENARIO_PARCELS.map((p) => {
    const gis12 = gis12Of(p)
    return polygonFeature(
      {
        MAPLOT: gis12,
        CAMA: `${gis12}000`,
        CAMA_2: null,
        CAMA_3: null,
        SITE_ADDR: `${p.lot * 2} ${p.name === 'K' ? 'Kingfisher Bend' : 'Scenario Lane'}`,
        OWNER: p.owner,
        MAIL_ADDR: `PO Box ${300 + p.lot}, Alder Pond NH 03999`,
      },
      p.ringFt,
    )
  })
}

function kingfisherCenterline(): [number, number][] {
  return arcPoints(180, 270, 2, 500).map(abs)
}

export function roadCenterlineFeatures(): GeoJSON.Feature<GeoJSON.LineString>[] {
  return [
    lineFeature({ ROAD_ID: 'OSP', NAME: 'Osprey Point Road' }, [abs([0, 0]), abs([1500, 0])]),
    lineFeature({ ROAD_ID: 'KFB', NAME: 'Kingfisher Bend' }, kingfisherCenterline()),
  ]
}

export function roadRightOfWayFeatures(): GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.LineString>[] {
  return [
    polygonFeature({ ROAD_ID: 'OSP', NAME: 'Osprey Point Road' }, rectRing(0, 1500, -25, 25)),
    lineFeature({ ROAD_ID: 'KFB', NAME: 'Kingfisher Bend' }, kingfisherCenterline()),
  ]
}

export function waterPolygonFeatures(): GeoJSON.Feature<GeoJSON.Polygon>[] {
  return [
    polygonFeature({ WATER_ID: 'MINK', NAME: 'Mink Brook' }, rectRing(3000, 3030, -1000, 1000)),
    polygonFeature({ WATER_ID: 'HERON', NAME: 'Heron Pond' }, rectRing(5000, 5600, -300, 300)),
  ]
}

export function waterCenterlineFeatures(): GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.LineString>[] {
  return [
    lineFeature({ WATER_ID: 'MINK', NAME: 'Mink Brook' }, [abs([3015, -1000]), abs([3015, 1000])]),
    polygonFeature({ WATER_ID: 'HERON', NAME: 'Heron Pond' }, rectRing(5000, 5600, -300, 300)),
  ]
}
