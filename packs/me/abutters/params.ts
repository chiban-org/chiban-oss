import { ME_URLS } from '@packs/me/rules/urls'
import type { AbutterParams } from '@/features/packs/schema'

export const ME_ABUTTER_PARAMS: AbutterParams = {
  key: 'me.adjacent_buffer.v1',
  version: 1,
  citation: { label: '30-A MRSA §4403(3)(A)', url: ME_URLS.title30Asec4403 },
  captureRadiusFt: null,
  adjacencyToleranceFt: 1,
  simplifyToleranceFt: 2,
  cornerTurnDeg: 30,
  areaFrontageToleranceFt: 5,
  parallelToleranceDeg: 45,
  onFeatureToleranceFt: 0.5,
  maxCrossingFt: 300,
  alongDepthFt: 5,
  tolerancesLabel:
    'Engineering tolerances chosen by Chiban. Town buffer at most 1000 feet (Chiban limit).',
  townBuffer: { defaultFt: null, maxFt: 1000 },
}
