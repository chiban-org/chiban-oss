import { describe, expect, it } from 'vitest'
import { ApplicationTypeBodySchema } from '@/features/applications/applicationTypeSchema'
import {
  gatedStages,
  type ItemRecord,
  itemApplies,
  itemStatus,
  stageOpenFor,
  unmetItems,
} from '@/features/applications/documentChecklist'
import {
  type DocumentItem,
  documentItemsOf,
  STATE_PERMIT_AT_FILING,
} from '@/features/applications/documentItemSchema'
import { appTypeBody } from '@/test/configFixtures'

const plotPlan: DocumentItem = {
  key: 'plot_plan',
  label: 'Plot plan',
  stage: 'to_file',
  waivable: false,
}
const ownerAuthorization: DocumentItem = {
  key: 'owner_authorization',
  label: 'Owner authorization',
  stage: 'to_file',
  waivable: false,
  requiredIf: { field: 'is_owner', op: 'equals', value: 'no' },
}
const septic: DocumentItem = {
  key: 'septic_approval',
  label: 'State septic approval',
  stage: 'before_issue',
  waivable: false,
  requiredIf: {
    all: [
      { field: 'town_sewer', op: 'equals', value: 'no' },
      { field: 'bedrooms_change', op: 'is_true' },
    ],
  },
}
const narrative: DocumentItem = {
  key: 'waiver_narrative',
  label: 'Waiver requests',
  stage: 'to_file',
  waivable: true,
  optional: true,
}
const landscaping: DocumentItem = {
  key: 'landscaping_plan',
  label: 'Landscaping plan',
  stage: 'to_file',
  waivable: true,
}

const EMPTY: ItemRecord = { documentIds: [], waiverRequested: false, accepted: false }

describe('document item applicability', () => {
  it('treats an item with no condition as always required', () => {
    expect(itemApplies(plotPlan, {})).toBe(true)
  })

  it('applies a conditional item only when the form answers meet its condition', () => {
    expect(itemApplies(ownerAuthorization, { is_owner: 'no' })).toBe(true)
    expect(itemApplies(ownerAuthorization, { is_owner: 'yes' })).toBe(false)
    expect(itemApplies(septic, { town_sewer: 'no', bedrooms_change: true })).toBe(true)
    expect(itemApplies(septic, { town_sewer: 'yes', bedrooms_change: true })).toBe(false)
  })
})

describe('document item status', () => {
  it('reads provided, accepted, waiver requested, not needed, optional and missing', () => {
    expect(itemStatus(plotPlan, {}, { ...EMPTY, documentIds: ['d1'] })).toBe('provided')
    expect(itemStatus(plotPlan, {}, { ...EMPTY, accepted: true })).toBe('accepted')
    expect(itemStatus(landscaping, {}, { ...EMPTY, waiverRequested: true })).toBe(
      'waiver_requested',
    )
    expect(itemStatus(ownerAuthorization, { is_owner: 'yes' }, EMPTY)).toBe('not_needed')
    expect(itemStatus(narrative, {}, EMPTY)).toBe('optional')
    expect(itemStatus(plotPlan, {}, EMPTY)).toBe('missing')
  })

  it('ignores a waiver request on an item that is not waivable', () => {
    expect(itemStatus(plotPlan, {}, { ...EMPTY, waiverRequested: true })).toBe('missing')
  })
})

describe('unmet items for a stage', () => {
  const items = [plotPlan, ownerAuthorization, septic, narrative, landscaping]

  it('lists only applicable, unsatisfied items of the gated stages', () => {
    const records = new Map<string, ItemRecord>([
      ['landscaping_plan', { ...EMPTY, waiverRequested: true }],
    ])
    const unmet = unmetItems(items, ['to_file'], { is_owner: 'no' }, records)
    expect(unmet.map((i) => i.key)).toEqual(['plot_plan', 'owner_authorization'])
  })

  it('leaves later stages out of the filing check', () => {
    const unmet = unmetItems(items, ['before_issue'], { town_sewer: 'no', bedrooms_change: true })
    expect(unmet.map((i) => i.key)).toEqual(['septic_approval'])
  })
})

describe('which stages a transition checks', () => {
  it('checks filing items at submission and decision items at approval', () => {
    expect(gatedStages('submitted', 'issuance')).toEqual(['to_file'])
    expect(gatedStages('decided', 'issuance')).toEqual(['before_decision'])
    expect(gatedStages('denied', 'issuance')).toEqual([])
  })

  it('checks decision and issuance items at issuance, so a direct issue cannot skip them', () => {
    expect(gatedStages('issued', 'certificate_of_occupancy')).toEqual([
      'before_decision',
      'before_issue',
    ])
  })

  it('checks certificate items only when the type closes on a certificate', () => {
    expect(gatedStages('closed', 'certificate_of_occupancy')).toEqual(['before_co'])
    expect(gatedStages('closed', 'final_inspection_passed')).toEqual([])
  })
})

describe('when an applicant can still add a document for a stage', () => {
  it('keeps later stages open after the filing window closes', () => {
    expect(stageOpenFor('to_file', 'submitted')).toBe(true)
    expect(stageOpenFor('to_file', 'under_review')).toBe(false)
    expect(stageOpenFor('before_issue', 'decided')).toBe(true)
    expect(stageOpenFor('before_issue', 'issued')).toBe(false)
    expect(stageOpenFor('before_co', 'issued')).toBe(true)
  })
})

describe('the type validator', () => {
  it('reads a type version saved before document lists existed as an empty list', () => {
    const old = Object.fromEntries(
      Object.entries(appTypeBody()).filter(([key]) => key !== 'documents'),
    )
    expect(documentItemsOf(old as { documents?: DocumentItem[] })).toEqual([])
    expect(ApplicationTypeBodySchema.safeParse(old).success).toBe(true)
  })

  it('refuses a state or federal permit as a filing requirement for a Planning Board type', () => {
    const body = appTypeBody({
      classification: 'nh.pb_subdivision',
      documents: [
        {
          key: 'des_subdivision',
          label: 'NHDES subdivision approval',
          stage: 'to_file',
          waivable: false,
          stateOrFederalPermit: true,
        },
      ],
    })
    const parsed = ApplicationTypeBodySchema.safeParse(body)
    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues.map((i) => [i.path.join('.'), i.message])).toEqual([
      ['documents.0.stage', STATE_PERMIT_AT_FILING],
    ])
  })

  it('refuses the same for a ZBA type and allows it before the decision', () => {
    const permit: DocumentItem = {
      key: 'shoreland',
      label: 'Shoreland permit',
      stage: 'to_file',
      waivable: false,
      stateOrFederalPermit: true,
    }
    const zba = appTypeBody({ classification: 'nh.zba_variance', documents: [permit] })
    expect(ApplicationTypeBodySchema.safeParse(zba).success).toBe(false)
    const later = appTypeBody({
      classification: 'nh.zba_variance',
      documents: [{ ...permit, stage: 'before_decision' }],
    })
    expect(ApplicationTypeBodySchema.safeParse(later).success).toBe(true)
  })

  it('allows a state permit at filing for a building permit and refuses duplicate keys', () => {
    const permit: DocumentItem = { ...plotPlan, stateOrFederalPermit: true }
    expect(ApplicationTypeBodySchema.safeParse(appTypeBody({ documents: [permit] })).success).toBe(
      true,
    )
    const twice = appTypeBody({ documents: [plotPlan, plotPlan] })
    expect(ApplicationTypeBodySchema.safeParse(twice).success).toBe(false)
  })
})
