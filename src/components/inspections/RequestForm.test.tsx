// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import { RequestForm } from '@/components/inspections/RequestForm'

class ResizeObserverStub {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub)

afterEach(cleanup)

function renderForm(submitLabel?: string) {
  render(
    <CsrfProvider token="t1">
      <RequestForm
        applicationId="a1"
        types={[{ checklistVersionId: 'c1', label: 'Final' }]}
        dates={[]}
        action={vi.fn()}
        channels={[{ value: 'portal', label: 'Portal' }]}
        phoneHoursText="weekdays"
        outsidePhoneHours={false}
        {...(submitLabel === undefined ? {} : { submitLabel })}
      />
    </CsrfProvider>,
  )
}

describe('RequestForm', () => {
  it('never labels the button with the old staff phrase', () => {
    renderForm()
    expect(screen.queryByRole('button', { name: 'Take the request' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Request inspection' })).toBeTruthy()
  })

  it('uses the label the page passes', () => {
    renderForm('Record request')
    expect(screen.getByRole('button', { name: 'Record request' })).toBeTruthy()
  })

  it('keeps the contact inputs at 16px at every breakpoint', () => {
    renderForm()
    for (const name of ['Contact name', 'Contact phone']) {
      const input = screen.getByRole(name === 'Contact phone' ? 'textbox' : 'textbox', {
        name: new RegExp(name, 'i'),
      })
      const classes = input.className.split(/\s+/)
      expect(classes.filter((c) => /^(?:(?:sm|md|lg|xl|2xl):)?text-(?:sm|xs)$/.test(c))).toEqual([])
      expect(classes).toContain('md:text-base')
    }
  })

  it('shows a refusal beside the contact name and caps the notes at the server limit', async () => {
    const action = vi.fn(() =>
      Promise.resolve({
        ok: false as const,
        error: 'Enter a contact name.',
        fieldErrors: { contactName: 'Enter a contact name.' },
      }),
    )
    render(
      <CsrfProvider token="t1">
        <RequestForm
          applicationId="a1"
          types={[{ checklistVersionId: 'c1', label: 'Final' }]}
          dates={[]}
          action={action}
          channels={[{ value: 'portal', label: 'Portal' }]}
          phoneHoursText="weekdays"
          outsidePhoneHours={false}
        />
      </CsrfProvider>,
    )
    const name = screen.getByRole('textbox', { name: /Contact name/ })
    fireEvent.change(name, { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: 'Request inspection' }))
    await waitFor(() => expect(name.getAttribute('aria-invalid')).toBe('true'))
    expect(name.closest('[data-slot="field"]')?.textContent).toContain('Enter a contact name.')
    expect(screen.getByRole('textbox', { name: 'Access notes' }).getAttribute('maxlength')).toBe(
      '1000',
    )
  })
})
