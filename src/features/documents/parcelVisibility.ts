export type ParcelFileVisibility = 'public' | 'private'

const PUBLIC_BY_DEFAULT: readonly string[] = [
  'nh.rs.building_permits',
  'nh.rs.building_permits_lapsed',
  'nh.rs.blueprints_architectural',
  'nh.rs.driveway_permits',
  'nh.rs.septic_plans',
]

export function defaultParcelFileVisibility(seriesKey: string): ParcelFileVisibility {
  return PUBLIC_BY_DEFAULT.includes(seriesKey) ? 'public' : 'private'
}
