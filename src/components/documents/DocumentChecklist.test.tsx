// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import { type ChecklistActions, DocumentChecklist } from '@/components/documents/DocumentChecklist'
import type {
  ChecklistRow,
  DocumentChecklistView,
} from '@/features/applications/documentChecklistView'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

afterEach(cleanup)

const noop = () => Promise.resolve({ ok: true as const, message: 'ok' })
const ACTIONS: ChecklistActions = {
  upload: {
    createIntent: () => Promise.resolve({ ok: false, error: 'x' }),
    finalize: () => Promise.resolve({ ok: false, error: 'x' }),
  },
  link: noop,
  unlink: noop,
  requestWaiver: noop,
  withdrawWaiver: noop,
  accept: noop,
  undoAccept: noop,
}

function row(overrides: Partial<ChecklistRow>): ChecklistRow {
  return {
    key: 'plot_plan',
    label: 'Plot plan',
    help: null,
    stage: 'to_file',
    status: 'missing',
    notNeeded: null,
    files: [],
    waivable: false,
    open: true,
    waiver: null,
    accepted: null,
    ...overrides,
  }
}

const VIEW: DocumentChecklistView = {
  applicationId: 'a1',
  stages: [
    {
      stage: 'to_file',
      label: 'To file',
      rows: [
        row({ status: 'provided', files: [{ documentId: 'd1', title: 'plot-plan.pdf' }] }),
        row({ key: 'floor_plans', label: 'Floor plans and framing' }),
        row({
          key: 'owner_authorization',
          label: 'Owner authorization',
          status: 'not_needed',
          notNeeded: 'Are you the property owner? is No',
        }),
        row({ key: 'landscaping', label: 'Landscaping plan', waivable: true }),
      ],
    },
    {
      stage: 'before_issue',
      label: 'Before the permit is issued',
      rows: [row({ key: 'septic', label: 'State septic approval', stage: 'before_issue' })],
    },
  ],
  files: [{ documentId: 'd1', title: 'plot-plan.pdf' }],
  other: [],
  missingToFile: ['Floor plans and framing', 'Landscaping plan'],
}

function renderAs(actor: 'applicant' | 'staff') {
  render(
    <CsrfProvider token="t1">
      <DocumentChecklist
        view={VIEW}
        actor={actor}
        permissions={{ canFile: true, canAccept: actor === 'staff', canUploadOther: false }}
        actions={ACTIONS}
        maxBytes={1024}
      />
    </CsrfProvider>,
  )
}

function item(label: string): HTMLElement {
  const found = screen.getAllByRole('listitem').find((li) => li.textContent.includes(label))
  if (found === undefined) throw new TypeError(`no item ${label}`)
  return found
}

describe('DocumentChecklist for the applicant', () => {
  it('shows a picker per missing item, the reuse menu, and the reason an item is not needed', () => {
    renderAs('applicant')
    expect(within(item('Plot plan')).getByRole('link', { name: 'plot-plan.pdf' })).toBeTruthy()
    const floor = item('Floor plans and framing')
    expect(within(floor).getByLabelText('Choose a file for Floor plans and framing')).toBeTruthy()
    expect(
      within(floor).getByLabelText('Use a file already added for Floor plans and framing'),
    ).toBeTruthy()
    expect(item('Owner authorization').textContent).toContain(
      'Not needed: only when Are you the property owner? is No.',
    )
    expect(within(item('Landscaping plan')).getByText('Request a waiver')).toBeTruthy()
    expect(item('State septic approval').textContent).toContain('Missing. Can come later')
    expect(screen.queryByText('Accept without the document')).toBeNull()
  })
})

describe('DocumentChecklist for staff', () => {
  it('offers acceptance without the document and no applicant upload', () => {
    renderAs('staff')
    const floor = item('Floor plans and framing')
    expect(within(floor).getAllByText('Accept without the document').length).toBeGreaterThan(0)
    expect(within(floor).queryByLabelText('Choose a file for Floor plans and framing')).toBeNull()
    expect(within(floor).queryByText('Request a waiver')).toBeNull()
    expect(
      within(item('Owner authorization')).queryByText('Accept without the document'),
    ).toBeNull()
  })
})
