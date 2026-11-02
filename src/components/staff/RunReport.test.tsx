// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { RunReport } from '@/components/staff/RunReport'
import type { ImportRunReport } from '@/features/gis/import/types'

afterEach(cleanup)

const report: ImportRunReport = {
  runId: 'r1',
  layerKey: 'parcels',
  status: 'succeeded',
  countSourceFeatures: 37,
  countIn: 36,
  countCreated: 30,
  countApplied: 2,
  countUnchanged: 3,
  countExcepted: 1,
  countMergedParts: 1,
  countMissingFromLayer: 0,
  exceptionsByKind: { invalid_geometry: 1 },
  startedAt: '2027-01-01T15:00:00.000Z',
  finishedAt: '2027-01-01T15:00:05.000Z',
}

describe('RunReport', () => {
  it('shows in, created, applied, unchanged, and excepted counts', () => {
    render(<RunReport report={report} />)
    for (const [label, value] of [
      ['Rows in', '36'],
      ['Created', '30'],
      ['Applied', '2'],
      ['Unchanged', '3'],
      ['Excepted', '1'],
    ] as const) {
      const term = screen.getByText(label)
      expect(term.nextElementSibling?.textContent).toBe(value)
    }
  })

  it('lists exceptions by kind', () => {
    render(<RunReport report={report} />)
    expect(screen.getByText('invalid geometry')).toBeTruthy()
  })
})
