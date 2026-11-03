// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { InspectionHistoryRow } from '@/features/inspections/history'
import type { InspectionsPanelData } from './inspectionsPanel'

vi.mock('../../inspections/actions', () => ({
  cancelInspectionAction: () => Promise.resolve({ ok: true, message: '' }),
  issueCertificateAction: () => Promise.resolve({ ok: true, message: '' }),
}))

const { InspectionsPanel } = await import('./inspectionsPanel')

afterEach(cleanup)

function row(id: string, patch: Partial<InspectionHistoryRow>): InspectionHistoryRow {
  return {
    id,
    inspectionType: 'framing',
    status: 'failed',
    reinspectionOf: null,
    scheduledDate: null,
    startMinute: null,
    resultNotes: null,
    photoCount: 0,
    rowVersion: 1,
    isFinal: false,
    items: [],
    ...patch,
  } as unknown as InspectionHistoryRow
}

function data(history: InspectionHistoryRow[], reinspectableIds: string[]): InspectionsPanelData {
  return {
    history,
    canSchedule: true,
    certificateReady: false,
    rowVersion: 1,
    today: '2026-11-02',
    reinspectableIds,
    takesRequests: true,
  }
}

function renderPanel(d: InspectionsPanelData) {
  render(
    <CsrfProvider token="t">
      <InspectionsPanel data={d} applicationId="a1" number="BP-2025-0001" />
    </CsrfProvider>,
  )
}

describe('InspectionsPanel', () => {
  it('offers a reinspection only on the failure that is still open', () => {
    renderPanel(data([row('old', {}), row('new', { reinspectionOf: 'old' })], ['new']))
    const links = screen.getAllByRole('link', { name: 'Request a reinspection' })
    expect(links).toHaveLength(1)
    expect(links[0]?.getAttribute('href')).toContain('reinspect=new')
  })

  it('counts one photo in the singular', () => {
    renderPanel(data([row('a', { status: 'passed', photoCount: 1 })], []))
    expect(screen.getByText('1 photo')).toBeTruthy()
  })
})
