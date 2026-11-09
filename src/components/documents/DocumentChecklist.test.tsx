// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import { type ChecklistActions, DocumentChecklist } from '@/components/documents/DocumentChecklist'
import { LiveAnswersContext } from '@/components/portal/liveAnswers'
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
    neededWhen: null,
    requiredIf: null,
    optional: false,
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
  submitted: false,
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
          neededWhen: 'Needed only if you answer “No” to “Are you the property owner?”.',
          requiredIf: { field: 'is_owner', op: 'equals', value: 'no' },
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

function renderAs(
  actor: 'applicant' | 'staff',
  options: { view?: DocumentChecklistView; answers?: Record<string, unknown> } = {},
) {
  const checklist = (
    <DocumentChecklist
      view={options.view ?? VIEW}
      actor={actor}
      permissions={{ canFile: true, canAccept: actor === 'staff', canUploadOther: false }}
      actions={ACTIONS}
      maxBytes={1024}
    />
  )
  render(
    <CsrfProvider token="t1">
      {options.answers === undefined ? (
        checklist
      ) : (
        <LiveAnswersContext.Provider value={options.answers}>
          {checklist}
        </LiveAnswersContext.Provider>
      )}
    </CsrfProvider>,
  )
}

function notNeededGroup(): HTMLElement | null {
  return screen.queryByText(/^Not needed for this project/)?.closest('details') ?? null
}

function item(label: string): HTMLElement {
  const found = screen.getAllByRole('listitem').find((li) => li.textContent.includes(label))
  if (found === undefined) throw new TypeError(`no item ${label}`)
  return found
}

describe('DocumentChecklist for the applicant', () => {
  it('shows a picker per missing item, the reuse menu behind a disclosure, and waivers', () => {
    renderAs('applicant')
    expect(within(item('Plot plan')).getByRole('link', { name: 'plot-plan.pdf' })).toBeTruthy()
    const floor = item('Floor plans and framing')
    expect(within(floor).getByLabelText('Choose a file for Floor plans and framing')).toBeTruthy()
    expect(within(floor).getByText('Use a file you already added').closest('details')).toBeTruthy()
    const reuse = within(floor).getByLabelText<HTMLSelectElement>(
      /^Use a file already added for Floor plans and framing/,
    )
    expect(reuse.value).toBe('')
    expect(within(item('Landscaping plan')).getByText('Request a waiver')).toBeTruthy()
    expect(item('State septic approval').textContent).toContain('Missing. Can come later')
    expect(screen.queryByText('Accept without the document')).toBeNull()
  })

  it('folds documents this project does not need into one counted group, with a plain reason', () => {
    renderAs('applicant')
    const group = notNeededGroup()
    expect(group?.querySelector('summary')?.textContent).toBe('Not needed for this project (1)')
    const owner = within(group as HTMLElement)
      .getByText('Owner authorization')
      .closest('li')
    expect(owner?.textContent).toContain(
      'Needed only if you answer “No” to “Are you the property owner?”.',
    )
    expect(owner?.textContent).not.toContain('Not needed')
    const main = screen.getAllByRole('listitem').filter((li) => group?.contains(li) !== true)
    expect(main.some((li) => li.textContent.includes('Owner authorization'))).toBe(false)
  })

  it('moves a document into the needed list as soon as the live answers call for it', () => {
    renderAs('applicant', { answers: { is_owner: 'no' } })
    expect(notNeededGroup()).toBeNull()
    expect(item('Owner authorization').textContent).toContain('Missing')
    expect(
      within(item('Owner authorization')).getByLabelText('Choose a file for Owner authorization'),
    ).toBeTruthy()
  })

  it('stops offering Unassign once the application is submitted', () => {
    renderAs('applicant')
    expect(within(item('Plot plan')).getByRole('button', { name: /Unassign/ })).toBeTruthy()
    cleanup()
    renderAs('applicant', { view: { ...VIEW, submitted: true } })
    expect(within(item('Plot plan')).queryByRole('button', { name: /Unassign/ })).toBeNull()
  })
})

describe('DocumentChecklist for staff', () => {
  it('lets the clerk upload to an item, record a waiver request, and accept without the file', () => {
    renderAs('staff')
    const floor = item('Floor plans and framing')
    expect(within(floor).getAllByText('Accept without the document').length).toBeGreaterThan(0)
    expect(within(floor).getByLabelText('Choose a file for Floor plans and framing')).toBeTruthy()
    expect(within(floor).queryByText('Request a waiver')).toBeNull()
    expect(within(item('Landscaping plan')).getByText('Record a waiver request')).toBeTruthy()
    expect(
      within(item('Owner authorization')).queryByText('Accept without the document'),
    ).toBeNull()
  })
})
