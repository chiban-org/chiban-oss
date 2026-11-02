import { describe, expect, it } from 'vitest'
import { allRings, exteriorRings } from '@/features/abutters/crossingInputs'
import { finalRecipients } from '@/features/abutters/draft'
import { projectAcross } from '@/features/abutters/projection/projectAcross'
import { NORTH_PARCELS, PARAMS, PARCEL_A } from '@/features/abutters/projection/testKit'
import type { CrossingFeature } from '@/features/abutters/projection/types'
import type { Recipient } from '@/features/abutters/resolution'

const SEGMENTED: CrossingFeature = {
  id: 'osprey-split',
  layer: 'roads',
  name: 'Osprey Point Road',
  geometry: {
    kind: 'line',
    paths: [
      [
        [0, 0],
        [400, 0],
      ],
      [
        [400, 0],
        [1500, 0],
      ],
    ],
  },
}

describe('review: segmented road geometry', () => {
  it('a road digitized as joined segments projects like one continuous road', () => {
    const result = projectAcross({
      applicantRings: [PARCEL_A],
      others: NORTH_PARCELS,
      features: [SEGMENTED],
      params: PARAMS,
    })
    expect(result.points).toHaveLength(2)
    expect(result.flags).toEqual([])
  })
})

describe('review: polygon holes', () => {
  it('keeps interior rings for parcels and only the exterior for water', () => {
    const polygon = {
      type: 'Polygon' as const,
      coordinates: [
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
          [0, 0],
        ],
        [
          [3, 3],
          [6, 3],
          [6, 6],
          [3, 6],
          [3, 3],
        ],
      ],
    }
    expect(allRings(polygon)).toHaveLength(2)
    expect(exteriorRings(polygon)).toHaveLength(1)
  })
})

function row(data: Partial<Recipient>, qualifies: boolean | null) {
  return {
    id: 'r',
    listId: 'l',
    originKey: 'k',
    position: 0,
    excluded: false,
    exclusionReason: null,
    qualifies,
    decisionReason: null,
    data: {
      key: 'k',
      roles: ['applicant', 'mhp_tenant'],
      name: 'Lee Marsh',
      mailingAddress: '4 Heron Road',
      parcelIds: [],
      channelHint: 'verified_mail',
      status: 'needs_decision',
      provenance: [],
      ...data,
    },
  }
}

describe('review: a tenant who does not qualify', () => {
  it('keeps the applicant notice when the same person is also a tenant', () => {
    const kept = finalRecipients([row({}, false)])
    expect(kept).toHaveLength(1)
    expect(kept[0]?.roles).toEqual(['applicant'])
  })

  it('drops a recipient who is only a tenant', () => {
    expect(finalRecipients([row({ roles: ['mhp_tenant'] }, false)])).toEqual([])
  })

  it('keeps every role when the tenant qualifies', () => {
    expect(finalRecipients([row({}, true)])[0]?.roles).toEqual(['applicant', 'mhp_tenant'])
  })
})
