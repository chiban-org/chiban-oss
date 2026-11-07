// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { InspectionHistoryRow } from '@/features/inspections/history'
import type { InspectionView } from '@/features/inspections/inspectionView'
import type { InspectionsPanelData } from './inspectionsPanel'
import type { InspectorWork } from './inspectorData'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('../../inspections/[inspectionId]/actions', () => ({ recordResultAction: vi.fn() }))
vi.mock('../../inspections/actions', () => ({
  cancelInspectionAction: vi.fn(),
  issueCertificateAction: vi.fn(),
}))

const { NextInspection } = await import('./inspectorSections')

afterEach(cleanup)

function scheduled(id: string, startMinute: number): InspectionHistoryRow {
  return {
    id,
    status: 'scheduled',
    inspectionType: 'framing',
    reinspectionOf: null,
    inspectorUserId: 'me',
    scheduledDate: '2026-11-06',
    startMinute,
    resultRecordedAt: null,
    rowVersion: 1,
    resultNotes: null,
    photoCount: 0,
    items: [],
  } as unknown as InspectionHistoryRow
}

function workFor(row: InspectionHistoryRow): InspectorWork {
  const next = {
    inspection: row,
    canRecord: true,
    waitingForDate: false,
    items: [{ key: 'frame', label: 'Structural framing', required: true, outcome: null, note: '' }],
  } as unknown as InspectionView
  return { next, last: null, inspectorName: 'Ira Inspector' }
}

function dataFor(rows: InspectionHistoryRow[]): InspectionsPanelData {
  return {
    history: rows,
    canSchedule: true,
    certificateReady: false,
    rowVersion: 1,
    today: '2026-11-06',
    reinspectableIds: [],
    takesRequests: true,
  }
}

function focused(work: InspectorWork, data: InspectionsPanelData) {
  return (
    <CsrfProvider token="t1">
      <NextInspection work={work} data={data} number="BP-2025-0001" />
    </CsrfProvider>
  )
}

describe('the inspection on top of the inspector view', () => {
  it('starts the checklist empty when the next inspection changes', () => {
    const first = scheduled('11111111-1111-4111-8111-111111111111', 600)
    const second = scheduled('22222222-2222-4222-8222-222222222222', 660)
    const data = dataFor([first, second])
    const { rerender } = render(focused(workFor(first), data))
    fireEvent.click(screen.getByRole('radio', { name: 'Pass' }))
    expect(screen.getByRole('radio', { name: 'Pass' }).getAttribute('aria-checked')).toBe('true')
    rerender(focused(workFor(second), dataFor([second])))
    expect(screen.getByRole('radio', { name: 'Pass' }).getAttribute('aria-checked')).toBe('false')
  })

  it('keeps the way to cancel it for someone who schedules inspections', () => {
    const row = scheduled('33333333-3333-4333-8333-333333333333', 600)
    render(focused(workFor(row), dataFor([row])))
    const section = screen.getByRole('region', { name: 'Next inspection' })
    expect(within(section).queryByText('Cancel', { exact: true })).not.toBeNull()
  })
})
