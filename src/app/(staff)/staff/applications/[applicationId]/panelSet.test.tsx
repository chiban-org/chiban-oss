import { describe, expect, it } from 'vitest'
import type { StaffApplicationView } from '@/features/applications/staffApplicationView'
import type { InspectionsPanelData } from './inspectionsPanel'
import { applicationPanels, type RecordPanelsInput } from './panelSet'

function input(
  canAdd: boolean,
  noteCount: number,
  options: { canAssign?: boolean; canIssue?: boolean } = {},
): RecordPanelsInput {
  const view = {
    id: 'a1',
    state: 'under_review',
    classification: 'nh.other',
    completedDate: null,
    gates: [],
    nextTransitions: [],
    conditions: [],
    conditionLibrary: [{ code: 'SEPTIC', text: 'Septic' }],
    clocks: [],
    noticeDeadlines: [],
    fees: { assessments: [], preview: null, overrides: [] },
    appeals: [],
    parties: [],
    permissions: { canIssue: options.canIssue === true },
  } as unknown as StaffApplicationView
  return {
    view,
    records: { reviewers: [], documents: [], canAssign: options.canAssign === true },
    payments: null,
    inspections: { history: [], takesRequests: false } as unknown as InspectionsPanelData,
    board: null,
    hearings: null,
    notes: {
      notes: Array.from({ length: noteCount }, (_, i) => ({ id: `n${i}` })),
      activity: [],
      canAdd,
    },
  } as unknown as RecordPanelsInput
}

function keys(nodes: readonly unknown[] | undefined): string[] {
  return (nodes ?? []).map((n) => String((n as { key: unknown }).key))
}

describe('application panels', () => {
  it('keeps the notes panel in the main group while staff can add a note, so it does not move when the first note is saved', () => {
    const empty = applicationPanels(input(true, 0))
    const filled = applicationPanels(input(true, 1))
    expect(keys(empty.filled)).toContain('notes')
    expect(keys(filled.filled)).toContain('notes')
  })

  it('files an empty notes panel under nothing recorded yet for those who cannot add a note', () => {
    const parts = applicationPanels(input(false, 0))
    expect(keys(parts.filled)).not.toContain('notes')
    expect(keys(parts.empty)).toContain('notes')
  })

  it('keeps the reviewers and conditions panels in the main group while staff can act on them', () => {
    const parts = applicationPanels(input(false, 0, { canAssign: true, canIssue: true }))
    expect(keys(parts.filled)).toEqual(expect.arrayContaining(['reviewers', 'conditions']))
    const readOnly = applicationPanels(input(false, 0))
    expect(keys(readOnly.filled)).not.toContain('reviewers')
    expect(keys(readOnly.filled)).not.toContain('conditions')
  })
})
