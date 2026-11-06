import { describe, expect, it } from 'vitest'
import type { StaffApplicationView } from '@/features/applications/staffApplicationView'
import type { InspectionsPanelData } from './inspectionsPanel'
import { applicationPanels, type RecordPanelsInput } from './panelSet'

interface Options {
  state?: string
  canAdd?: boolean
  notes?: number
  activity?: number
  reviewers?: number
  canAssign?: boolean
  canIssue?: boolean
  conditions?: number
  clocks?: number
  inspections?: number
  parties?: number
}

function many<T>(count: number | undefined, make: (i: number) => T): T[] {
  return Array.from({ length: count ?? 0 }, (_, i) => make(i))
}

function input(o: Options = {}): RecordPanelsInput {
  const view = {
    id: 'a1',
    state: o.state ?? 'under_review',
    classification: 'nh.other',
    completedDate: null,
    gates: [],
    nextTransitions: [],
    conditions: many(o.conditions, (i) => ({ id: `c${i}`, code: 'X' })),
    conditionLibrary: [{ code: 'SEPTIC', text: 'Septic' }],
    clocks: many(o.clocks, (i) => ({
      clockId: `k${i}`,
      status: 'running',
      daysRemaining: 5,
      allowedAdjustments: [],
      currentDue: { value: '2026-11-13' },
    })),
    noticeDeadlines: [],
    fees: { assessments: [], preview: null, overrides: [] },
    appeals: [],
    parties: many(o.parties, (i) => ({ id: `p${i}`, name: 'Pat', role: 'owner' })),
    codeEdition: null,
    regionalImpact: { applies: false, determination: null, notices: [] },
    permissions: { canIssue: o.canIssue === true },
  } as unknown as StaffApplicationView
  return {
    view,
    records: {
      reviewers: many(o.reviewers, (i) => ({ assignmentId: `r${i}` })),
      documents: [],
      choices: [{ id: 'u1', name: 'Remy Reviewer' }],
      canAssign: o.canAssign === true,
      snapshots: [],
      appHolds: [],
    },
    payments: null,
    inspections: {
      history: many(o.inspections, (i) => ({ id: `i${i}` })),
      takesRequests: false,
      reinspectableIds: [],
    } as unknown as InspectionsPanelData,
    board: null,
    hearings: null,
    notes: {
      notes: many(o.notes, (i) => ({ id: `n${i}` })),
      activity: many(o.activity, (i) => ({ id: `e${i}` })),
      canAdd: o.canAdd === true,
    },
  } as unknown as RecordPanelsInput
}

function keys(nodes: readonly unknown[] | undefined): string[] {
  return (nodes ?? []).map((n) => String((n as { key: unknown }).key))
}

describe('application panels', () => {
  it('files an empty notes panel under nothing recorded yet even for staff who can add a note', () => {
    for (const canAdd of [true, false]) {
      const parts = applicationPanels(input({ canAdd }))
      expect(keys(parts.filled)).not.toContain('notes')
      expect(keys(parts.empty)).toContain('notes')
    }
    expect(keys(applicationPanels(input({ canAdd: true, notes: 1 })).filled)).toContain('notes')
  })

  it('folds add-only reviewers and conditions panels into nothing recorded yet', () => {
    const parts = applicationPanels(input({ canAssign: true, canIssue: true }))
    expect(keys(parts.filled)).not.toContain('reviewers')
    expect(keys(parts.filled)).not.toContain('conditions')
    expect(keys(parts.empty)).toEqual(expect.arrayContaining(['reviewers', 'conditions']))
  })

  it('leads a permit under review with reviewers and clocks, then the other filled panels', () => {
    const parts = applicationPanels(
      input({ reviewers: 1, clocks: 1, conditions: 1, canIssue: true, notes: 1 }),
    )
    expect(keys(parts.filled)).toEqual(['reviewers', 'clocks', 'notes', 'conditions'])
  })

  it('leads an issued permit with inspections and conditions, not reviewers', () => {
    const parts = applicationPanels(
      input({ state: 'issued', reviewers: 1, clocks: 1, conditions: 1, inspections: 1 }),
    )
    expect(keys(parts.filled)).toEqual(['inspections', 'conditions', 'reviewers', 'clocks'])
  })

  it('folds filled activity and parties into the record and history group', () => {
    const parts = applicationPanels(input({ activity: 2, parties: 1, clocks: 1 }))
    expect(keys(parts.filled)).toEqual(['clocks'])
    expect(keys(parts.history)).toEqual(['activity', 'parties'])
  })

  it('keeps parties in the main list on a draft, where the stage leads with them', () => {
    const parts = applicationPanels(input({ state: 'draft', activity: 1, parties: 1 }))
    expect(keys(parts.filled)[0]).toBe('parties')
    expect(keys(parts.history)).toEqual(['activity'])
  })
})
