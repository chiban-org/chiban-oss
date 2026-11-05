// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { RtkRequestView } from '@/features/rtk/requests'
import type { CivilDate } from '@/types/civilDate'
import { ResponseSection } from './ResponseSection'

const action = vi.hoisted(() => vi.fn())
vi.mock('../actions', () => ({ firstResponseAction: action }))

afterEach(cleanup)

const request = {
  id: '6a7b8c9d-0e1f-4a2b-8c3d-4e5f6a7b8c9d',
  firstResponseKind: null,
  firstResponseOn: null,
  timeliness: { kind: 'open' },
  timeStatements: [],
} as unknown as RtkRequestView

function renderForm() {
  render(
    <CsrfProvider token="t1">
      <ResponseSection request={request} today={'2026-11-05' as CivilDate} working />
    </CsrfProvider>,
  )
  fireEvent.click(screen.getByText('Record the first response'))
}

function submitAs(kind: string) {
  fireEvent.change(screen.getByLabelText(/^Response/), { target: { value: kind } })
  fireEvent.click(screen.getByRole('button', { name: 'Record response' }))
}

describe('first response form', () => {
  it('a time statement without its date names the date field and moves focus to it', () => {
    renderForm()
    submitAs('time_statement')
    const date = screen.getByLabelText(/^Date the town will respond by/)
    expect(screen.getByRole('status').textContent).toBe(
      'Fill in: Date the town will respond by, if more time is needed.',
    )
    expect(document.activeElement).toBe(date)
    expect(date.getAttribute('aria-invalid')).toBe('true')
    expect(action).not.toHaveBeenCalled()
  })

  it('a posted-online response without its web address names that field', () => {
    renderForm()
    submitAs('website_reference')
    expect(screen.getByRole('status').textContent).toBe('Fill in: Web address, if posted online.')
    expect(document.activeElement).toBe(screen.getByLabelText(/^Web address/))
  })

  it('a denial asks for neither the date nor the web address', () => {
    renderForm()
    fireEvent.change(screen.getByLabelText(/^Response/), { target: { value: 'denied' } })
    expect(screen.getByLabelText<HTMLInputElement>(/^Date the town will respond by/).required).toBe(
      false,
    )
    expect(screen.getByLabelText<HTMLInputElement>(/^Web address/).required).toBe(false)
  })
})
