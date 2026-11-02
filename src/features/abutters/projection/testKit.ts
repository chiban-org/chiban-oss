import { NH_ABUTTER_PARAMS } from '@packs/nh/abutters/params'
import type { CrossingFeature, ProjectionParams } from '@/features/abutters/projection/types'
import type { Pt } from '@/features/abutters/projection/vec'

export const PARAMS: ProjectionParams = {
  simplifyToleranceFt: NH_ABUTTER_PARAMS.simplifyToleranceFt,
  cornerTurnDeg: NH_ABUTTER_PARAMS.cornerTurnDeg,
  lineFrontageToleranceFt: 50,
  areaFrontageToleranceFt: NH_ABUTTER_PARAMS.areaFrontageToleranceFt,
  parallelToleranceDeg: NH_ABUTTER_PARAMS.parallelToleranceDeg,
  onFeatureToleranceFt: NH_ABUTTER_PARAMS.onFeatureToleranceFt,
  maxCrossingFt: NH_ABUTTER_PARAMS.maxCrossingFt,
  alongDepthFt: NH_ABUTTER_PARAMS.alongDepthFt,
}

export function rect(x0: number, x1: number, y0: number, y1: number): Pt[] {
  return [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
    [x0, y0],
  ]
}

export function polar(cx: number, angleDeg: number, radius: number): Pt {
  const radians = (angleDeg * Math.PI) / 180
  return [cx + radius * Math.cos(radians), radius * Math.sin(radians)]
}

export function arc(cx: number, from: number, to: number, step: number, radius: number): Pt[] {
  const points: Pt[] = []
  for (let angle = from; angle <= to + 1e-9; angle += step) points.push(polar(cx, angle, radius))
  return points
}

export function sector(cx: number, from: number, to: number, innerR: number, outerR: number): Pt[] {
  const outer = arc(cx, from, to, 2.5, outerR)
  const inner = arc(cx, from, to, 2.5, innerR).reverse()
  return [...outer, ...inner, outer[0] as Pt]
}

export const OSPREY_CENTERLINE: CrossingFeature = {
  id: 'osprey',
  layer: 'roads',
  name: 'Osprey Point Road',
  geometry: {
    kind: 'line',
    paths: [
      [
        [0, 0],
        [1500, 0],
      ],
    ],
  },
}

export const OSPREY_ROW: CrossingFeature = {
  id: 'osprey-row',
  layer: 'roads',
  name: 'Osprey Point Road',
  geometry: { kind: 'area', rings: [rect(0, 1500, -25, 25)] },
}

export const MINK_POLYGON: CrossingFeature = {
  id: 'mink',
  layer: 'water',
  name: 'Mink Brook',
  geometry: { kind: 'area', rings: [rect(3000, 3030, -1000, 1000)] },
}

export const MINK_CENTERLINE: CrossingFeature = {
  id: 'mink-line',
  layer: 'water',
  name: 'Mink Brook',
  geometry: {
    kind: 'line',
    paths: [
      [
        [3015, -1000],
        [3015, 1000],
      ],
    ],
  },
}

export const HERON_POND: CrossingFeature = {
  id: 'heron',
  layer: 'water',
  name: 'Heron Pond',
  geometry: { kind: 'area', rings: [rect(5000, 5600, -300, 300)] },
}

export const KINGFISHER_CENTERLINE: CrossingFeature = {
  id: 'kingfisher',
  layer: 'roads',
  name: 'Kingfisher Bend',
  geometry: { kind: 'line', paths: [arc(7000, 180, 270, 2, 500)] },
}

export const NORTH_PARCELS = [
  { parcelId: 'N1', rings: [rect(0, 350.5, 25, 325)] },
  { parcelId: 'N2', rings: [rect(350.5, 470, 25, 325)] },
  { parcelId: 'N3', rings: [rect(470, 730, 25, 325)] },
  { parcelId: 'N4', rings: [rect(730, 845, 25, 325)] },
  { parcelId: 'N5', rings: [rect(855, 1100, 25, 325)] },
]

export const BANK_PARCELS = [
  { parcelId: 'E1', rings: [rect(3030, 3330, -500, -240)] },
  { parcelId: 'E2', rings: [rect(3030, 3330, -240, 100)] },
  { parcelId: 'E3', rings: [rect(3030, 3330, 100, 400)] },
]

export const INNER_LOTS = [
  { parcelId: 'I0', rings: [sector(7000, 170, 185, 175, 475)] },
  { parcelId: 'I1', rings: [sector(7000, 185, 205, 175, 475)] },
  { parcelId: 'I2', rings: [sector(7000, 205, 225, 175, 475)] },
  { parcelId: 'I3', rings: [sector(7000, 225, 240, 175, 475)] },
  { parcelId: 'I4', rings: [sector(7000, 245, 260, 175, 475)] },
]

export const PARCEL_A = rect(400, 800, -325, -25)
export const PARCEL_B = rect(2700, 3000, -200, 0)
export const PARCEL_P = rect(4700, 5000, -100, 100)
export const PARCEL_K: Pt[] = [
  ...arc(7000, 200, 230, 2.5, 525),
  polar(7000, 230, 825),
  polar(7000, 215, 825),
  polar(7000, 200, 825),
  polar(7000, 200, 525),
]

export interface ProbeScenario {
  name: string
  applicantRings: Pt[][]
  others: { parcelId: string; rings: Pt[][] }[]
  features: CrossingFeature[]
}

const SLIVER = { parcelId: 'sliver', rings: [rect(300, 900, -0.1, 0.05)] }

export const PROBE_SCENARIOS: ProbeScenario[] = [
  {
    name: 'standard',
    applicantRings: [PARCEL_A],
    others: NORTH_PARCELS,
    features: [OSPREY_CENTERLINE],
  },
  {
    name: 'spike',
    applicantRings: [
      [
        [400, -325],
        [800, -325],
        [800, -25],
        [601, -25],
        [600.5, -22],
        [600, -25],
        [400, -25],
        [400, -325],
      ],
    ],
    others: NORTH_PARCELS,
    features: [OSPREY_CENTERLINE],
  },
  {
    name: 'bend',
    applicantRings: [
      [
        [400, -325],
        [800, -325],
        [800, -25],
        [550, -8],
        [500, -25],
        [400, -25],
        [400, -325],
      ],
    ],
    others: NORTH_PARCELS,
    features: [OSPREY_CENTERLINE],
  },
  {
    name: 'offset',
    applicantRings: [rect(2700, 2997, -200, 0)],
    others: BANK_PARCELS,
    features: [MINK_POLYGON],
  },
  {
    name: 'angled',
    applicantRings: [
      [
        [400, -325],
        [800, -325],
        [800, -25],
        [470, -25],
        [430, -48],
        [400, -325],
      ],
    ],
    others: NORTH_PARCELS,
    features: [OSPREY_CENTERLINE],
  },
  {
    name: 'on feature',
    applicantRings: [rect(400, 800, -325, -0.3)],
    others: [SLIVER, ...NORTH_PARCELS],
    features: [OSPREY_CENTERLINE],
  },
  { name: 'wide', applicantRings: [PARCEL_P], others: [], features: [HERON_POND] },
]
