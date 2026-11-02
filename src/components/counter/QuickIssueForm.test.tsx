// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { CounterActions } from '@/components/counter/counterTypes'
import { ParcelSearchHotkey } from '@/components/counter/ParcelSearchHotkey'
import { QuickIssueForm } from '@/components/counter/QuickIssueForm'
import { ReaderPanel } from '@/components/counter/ReaderPanel'

beforeEach(() => {
  window.open = () => null
})
afterEach(cleanup)

const LOOKUP = {
  label: 'NH Office of Professional Licensure and Certification license lookup',
  url: 'https://oplc.nh.gov/license-lookup',
}

const idle: CounterActions = {
  issue: () => Promise.resolve({ ok: false, error: 'not used' }),
  reader: () => Promise.resolve({ ok: false, error: 'not used' }),
  check: () => Promise.resolve({ ok: false, error: 'not used' }),
  reconnect: () => Promise.resolve({ ok: false, error: 'not used' }),
  complete: () => Promise.resolve({ ok: false, error: 'not used' }),
}

function form(actions: CounterActions = idle) {
  return render(
    <CsrfProvider token="t1">
      <QuickIssueForm
        parcelId="p1"
        typeKey="EL"
        typeLabel="Electrical permit"
        fields={[
          { key: 'description', label: 'Description of work', type: 'textarea', required: true },
        ]}
        baseCents={4500}
        convenienceFee={{
          basisPoints: 300,
          fixedCents: 0,
          appliesTo: ['card_online', 'card_present'],
        }}
        cardAvailable={true}
        readerSimulated={true}
        lookup={LOOKUP}
        actions={actions}
      />
    </CsrfProvider>,
  )
}

function fillRequired() {
  fireEvent.change(screen.getByLabelText('Contractor name'), {
    target: { value: 'Pat Contractor' },
  })
  fireEvent.change(screen.getByLabelText('License number'), { target: { value: 'EL-1' } })
  fireEvent.change(screen.getByLabelText('Description of work'), { target: { value: 'Panel' } })
}

describe('QuickIssueForm', () => {
  it('fee section shows 46.35 for card and 45.00 for cash', () => {
    form()
    expect(screen.getByTestId('fee-total').textContent).toBe('$45.00')
    fireEvent.click(screen.getByLabelText('Card'))
    expect(screen.getByTestId('fee-total').textContent).toBe('$46.35')
    expect(screen.getByText(/Convenience fee \$1\.35/)).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Check'))
    expect(screen.getByTestId('fee-total').textContent).toBe('$45.00')
  })

  it('Alt+1 to Alt+3 pick cash, check, and card', () => {
    form()
    fireEvent.keyDown(window, { key: '2', altKey: true })
    expect(screen.getByLabelText<HTMLInputElement>('Check').checked).toBe(true)
    fireEvent.keyDown(window, { key: '3', altKey: true })
    expect(screen.getByLabelText<HTMLInputElement>('Card').checked).toBe(true)
    fireEvent.keyDown(window, { key: '1', altKey: true })
    expect(screen.getByLabelText<HTMLInputElement>('Cash').checked).toBe(true)
  })

  it('the license lookup link opens a new tab', () => {
    form()
    const link = screen.getByRole('link', { name: LOOKUP.label })
    expect(link.getAttribute('href')).toBe(LOOKUP.url)
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
  })

  it('has one primary action named Issue and print', () => {
    form()
    expect(screen.getAllByRole('button', { name: 'Issue and print' })).toHaveLength(1)
  })

  it('a failed issue shows the error and re-enables the button', async () => {
    form({
      ...idle,
      issue: () => Promise.resolve({ ok: false, error: 'The license is not active.' }),
    })
    fillRequired()
    fireEvent.click(screen.getByRole('button', { name: 'Issue and print' }))
    await waitFor(() => expect(screen.getByText('The license is not active.')).toBeTruthy())
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Issue and print' }).disabled,
    ).toBe(false)
  })

  it('an issued permit shows links to the permit, placard, and receipt', async () => {
    form({
      ...idle,
      issue: () =>
        Promise.resolve({
          ok: true,
          state: 'issued',
          number: 'EL-2027-0001',
          applicationId: 'a1',
          attemptId: null,
          links: { permit: '/p', placard: '/pl', receipt: '/r' },
        }),
    })
    fillRequired()
    fireEvent.click(screen.getByRole('button', { name: 'Issue and print' }))
    await waitFor(() => expect(screen.getByText(/EL-2027-0001 is issued/)).toBeTruthy())
    expect(screen.getByRole('link', { name: 'Permit' }).getAttribute('href')).toBe('/p')
    expect(screen.getByRole('link', { name: 'Placard' }).getAttribute('href')).toBe('/pl')
    expect(screen.getByRole('link', { name: 'Receipt' }).getAttribute('href')).toBe('/r')
  })
})

describe('ParcelSearchHotkey', () => {
  it('slash focuses the parcel search', () => {
    render(
      <>
        <input name="q" aria-label="Search" />
        <ParcelSearchHotkey />
      </>,
    )
    fireEvent.keyDown(window, { key: '/' })
    expect(document.activeElement).toBe(screen.getByLabelText('Search'))
  })
})

describe('ReaderPanel', () => {
  const base = { attemptId: 'att', applicationId: 'app', simulated: true }

  it('shows Present card on reader and the simulated controls with a not-connected notice', () => {
    render(
      <CsrfProvider token="t1">
        <ReaderPanel {...base} actions={idle} onIssued={() => undefined} />
      </CsrfProvider>,
    )
    expect(screen.getByText('Present card on reader')).toBeTruthy()
    expect(screen.getByText(/not connected to a live card reader/)).toBeTruthy()
    for (const name of ['Approve', 'Decline', 'Lose connection']) {
      expect(screen.getByRole('button', { name })).toBeTruthy()
    }
  })

  it('reader panel shows the unknown warning with a text label', async () => {
    render(
      <CsrfProvider token="t1">
        <ReaderPanel
          {...base}
          actions={{
            ...idle,
            reader: () => Promise.resolve({ ok: true, state: 'pending', outcomeUnknown: true }),
          }}
          onIssued={() => undefined}
        />
      </CsrfProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Lose connection' }))
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('Outcome unknown. Do not issue.'),
    )
    expect(screen.getByRole('button', { name: 'Check with processor' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reader reconnected: approved' })).toBeTruthy()
  })

  it('approval completes the issue and reports it', async () => {
    let issued = ''
    render(
      <CsrfProvider token="t1">
        <ReaderPanel
          {...base}
          actions={{
            ...idle,
            reader: () => Promise.resolve({ ok: true, state: 'captured', outcomeUnknown: false }),
            complete: () =>
              Promise.resolve({
                ok: true,
                state: 'issued',
                number: 'EL-2027-0001',
                applicationId: 'app',
                attemptId: 'att',
                links: { permit: '/p', placard: '/pl', receipt: '/r' },
              }),
          }}
          onIssued={(outcome) => {
            issued = outcome.ok ? outcome.number : ''
          }}
        />
      </CsrfProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(issued).toBe('EL-2027-0001'))
  })

  it('a decline says the payment did not go through', async () => {
    render(
      <CsrfProvider token="t1">
        <ReaderPanel
          {...base}
          actions={{
            ...idle,
            reader: () => Promise.resolve({ ok: true, state: 'declined', outcomeUnknown: false }),
          }}
          onIssued={() => undefined}
        />
      </CsrfProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }))
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain(
        'Card declined. The permit is not issued.',
      ),
    )
  })

  it('a real reader shows no simulated controls', () => {
    render(
      <CsrfProvider token="t1">
        <ReaderPanel {...base} simulated={false} actions={idle} onIssued={() => undefined} />
      </CsrfProvider>,
    )
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
  })
})
