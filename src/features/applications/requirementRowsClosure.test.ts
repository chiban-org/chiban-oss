import { ME_PACK } from '@packs/me'
import { describe, expect, it } from 'vitest'
import type { GateResult } from '@/features/gates/evaluateGates'
import { isFinalChecklist } from '@/features/inspections/checklistSchema'
import { finalChecklistLabel } from './closureStage'
import { gateRow, type RowFacts } from './requirementRows'

const CLOSING: GateResult = {
  key: 'closure.requirement_met',
  label: 'Closing requirement met',
  citation: null,
  kind: 'administrative',
  outcome: { status: 'blocked', reason: 'No final inspection has passed.' },
  override: null,
  effective: 'blocked',
}

function starterFinal(id: string): string | null {
  const starter = ME_PACK.starters.find((s) => s.id === id)
  if (starter === undefined) throw new Error(`no starter ${id}`)
  return finalChecklistLabel(
    starter.checklists.map((c) => ({ label: c.label, final: isFinalChecklist(c) })),
  )
}

function closingTask(finalLabel: string | null): string {
  const facts: RowFacts = {
    reviewers: 0,
    regionalDetermined: false,
    commissionNotified: false,
    abilities: new Set(['take_inspection_request']),
    closure: { stage: 'none', reinspectId: null, dueFinal: false, finalLabel },
  }
  return gateRow(CLOSING, facts).task
}

describe('the closing row names the final checklist', () => {
  it('a subsurface wastewater permit names its last inspection', () => {
    const label = starterFinal('me.starter.subsurface_wastewater')
    expect(label).toMatch(/^Before the system is covered/)
    expect(closingTask(label)).toBe(`Book the inspection: ${label}`)
  })

  it('a building permit keeps the final inspection wording', () => {
    expect(starterFinal('me.starter.building')).toBe('Final inspection')
    expect(closingTask('Final inspection')).toBe('Book the final inspection')
    expect(closingTask('Electrical final inspection')).toBe('Book the final inspection')
    expect(closingTask(null)).toBe('Book the final inspection')
  })
})
