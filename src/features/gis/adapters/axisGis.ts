import { type EsriDeps, type EsriError, readEsriLayer } from '@/features/gis/adapters/esriRest'
import type { SourceFeature } from '@/features/gis/import/types'
import type { Result } from '@/types/result'

export const AXISGIS_ADAPTER_STATUS = 'stubbed' as const

export const AXISGIS_STUB_NOTICE =
  'AxisGIS connection is not yet verified against a live town service.'

export async function readAxisGisLayer(
  config: { layerUrl: string },
  deps: EsriDeps,
  signal: AbortSignal,
): Promise<Result<SourceFeature[], EsriError>> {
  return await readEsriLayer(config.layerUrl, deps, signal)
}
