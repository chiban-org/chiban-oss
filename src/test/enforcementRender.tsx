import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { CaseDetail } from '@/features/enforcement/caseDetail'

export const ALL_CAN = {
  manage: true,
  issue: true,
  service: true,
  counsel: true,
  fine: true,
  collect: true,
  publish: true,
  manageDocuments: true,
}

export function renderForm(ui: ReactNode) {
  return render(<CsrfProvider token="t">{ui}</CsrfProvider>)
}

export function openSection(summary: string): void {
  fireEvent.click(screen.getByText(summary, { selector: 'summary' }))
}

export function fillField(label: RegExp, value: string): void {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

export const labelled = (text: string) =>
  new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( \\*)?$`)

export function stubDetail(overrides: Record<string, unknown> = {}): CaseDetail {
  return {
    staff: {
      row: {
        id: 'c1',
        rowVersion: 3,
        status: 'investigating',
        parcelId: null,
        isPublic: false,
        publicSummary: null,
      },
      notes: [],
      complaints: [],
    },
    today: '2027-07-20',
    stay: { stayed: false },
    banner: null,
    findings: [],
    notices: [],
    orders: [],
    appeals: [],
    fines: [],
    referrals: [],
    exposure: null,
    documents: [],
    names: {},
    ...overrides,
  } as unknown as CaseDetail
}
