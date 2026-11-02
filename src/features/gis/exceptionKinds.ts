export const IMPORT_EXCEPTION_KINDS = [
  'invalid_geometry',
  'missing_geometry',
  'missing_required_field',
  'id_format_mismatch',
  'id_numeric_lost_zeros',
  'id_resolves_to_retired',
  'alias_conflict',
  'alias_conflicts_override',
  'owner_changed',
  'missing_from_layer',
  'cama_parcel_unknown',
] as const

export type ImportExceptionKind = (typeof IMPORT_EXCEPTION_KINDS)[number]

export const GEOMETRY_LAYER_KEYS = ['parcels', 'roads', 'water'] as const
export const LAYER_KEYS = [...GEOMETRY_LAYER_KEYS, 'cama'] as const
export type LayerKey = (typeof LAYER_KEYS)[number]

export const LAYER_ADAPTERS = [
  'file_geojson',
  'file_shapefile',
  'file_geopackage',
  'esri_rest',
  'axisgis',
  'file_cama_csv',
] as const
export type LayerAdapter = (typeof LAYER_ADAPTERS)[number]
