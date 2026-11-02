export const NH_ABUTTER_PARAMS = {
  key: 'nh.abutters.adjacency_projection',
  version: 1,
  citation: { label: 'RSA 672:3', url: 'https://gc.nh.gov/rsa/html/LXIV/672/672-3.htm' },
  captureRadiusFt: 50,
  adjacencyToleranceFt: 1,
  simplifyToleranceFt: 2,
  cornerTurnDeg: 30,
  areaFrontageToleranceFt: 5,
  parallelToleranceDeg: 45,
  onFeatureToleranceFt: 0.5,
  maxCrossingFt: 300,
  alongDepthFt: 5,
  tolerancesLabel:
    'Engineering tolerances chosen by Chiban; only the 50-foot capture radius is statutory.',
} as const

export type NhAbutterParams = typeof NH_ABUTTER_PARAMS
