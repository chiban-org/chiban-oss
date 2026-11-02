const MAX_LONGITUDE = 180
const MAX_LATITUDE = 90
const MIN_RING_POSITIONS = 4
const MIN_LINE_POSITIONS = 2

function isPosition(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    value.every((n) => typeof n === 'number' && Number.isFinite(n))
  )
}

function positionIssue(value: unknown): string | null {
  if (!isPosition(value)) return 'Coordinates must be numbers'
  const [lon, lat] = value
  if (lon === undefined || lat === undefined) return 'Coordinates must be numbers'
  if (Math.abs(lon) > MAX_LONGITUDE || Math.abs(lat) > MAX_LATITUDE) {
    return 'Coordinates are outside the range of longitude and latitude'
  }
  return null
}

function positionsIssue(value: unknown, min: number): string | null {
  if (!Array.isArray(value) || value.length < min) return 'A line or ring has too few positions'
  for (const position of value) {
    const issue = positionIssue(position)
    if (issue !== null) return issue
  }
  return null
}

function ringIssue(ring: unknown): string | null {
  const issue = positionsIssue(ring, MIN_RING_POSITIONS)
  if (issue !== null) return issue
  const positions = ring as number[][]
  const first = positions[0]
  const last = positions.at(-1)
  const closed = first?.[0] === last?.[0] && first?.[1] === last?.[1]
  return closed ? null : 'A ring is not closed'
}

function polygonIssue(polygon: unknown): string | null {
  if (!Array.isArray(polygon) || polygon.length === 0) return 'A polygon has no rings'
  for (const ring of polygon) {
    const issue = ringIssue(ring)
    if (issue !== null) return issue
  }
  return null
}

function eachIssue(items: unknown, check: (item: unknown) => string | null): string | null {
  if (!Array.isArray(items) || items.length === 0) return 'The geometry has no parts'
  for (const item of items) {
    const issue = check(item)
    if (issue !== null) return issue
  }
  return null
}

export function coordinateIssue(geometry: GeoJSON.Geometry): string | null {
  const coordinates: unknown = (geometry as { coordinates?: unknown }).coordinates
  switch (geometry.type) {
    case 'Polygon':
      return polygonIssue(coordinates)
    case 'MultiPolygon':
      return eachIssue(coordinates, polygonIssue)
    case 'LineString':
      return positionsIssue(coordinates, MIN_LINE_POSITIONS)
    case 'MultiLineString':
      return eachIssue(coordinates, (line) => positionsIssue(line, MIN_LINE_POSITIONS))
    case 'Point':
    case 'MultiPoint':
    case 'GeometryCollection':
      return 'Unsupported geometry type'
  }
}
