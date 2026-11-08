// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { CounterActions } from '@/components/counter/counterTypes'
import { QuickIssueForm } from '@/components/counter/QuickIssueForm'
import { ReaderPanel } from '@/components/counter/ReaderPanel'

beforeEach(() => {
  window.open = () => null
})
afterEach(cleanup)

const LOOKUP = {
  label: 'NH license verification search',
  url: 'https://forms.nh.gov/licenseverification/Search.aspx',
}

const idle: CounterActions = {
  issue: () => Promise.resolve({ ok: false, error: 'not used' }),
  reader: () => Promise.resolve({ ok: false, error: 'not used' }),
  check: () => Promise.resolve({ ok: false, error: 'not used' }),
  reconnect: () => Promise.resolve({ ok: false, error: 'not used' }),
  complete: () => Promise.resolve({ ok: false, error: 'not used' }),
}

function form(actions: CounterActions = idle, licenseRequired = true) {
  return render(
    <CsrfProvider token="t1">
      <QuickIssueForm
        parcelId="p1"
        typeKey="EL"
        typeLabel="Electrical permit"
        parcelLabel="007001000000, 12 Heron Cove Road"
        summary={null}
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
        licenseRequired={licenseRequired}
        licenseGroups={[{ label: 'Electrical', licenses: ['Master electrician'] }]}
        defaultLicenseType="Master electrician"
        lookup={LOOKUP}
        actions={actions}
      />
    </CsrfProvider>,
  )
}

function fillRequired() {
  fireEvent.change(screen.getByLabelText(/^Contractor\ name( \*)?$/), {
    target: { value: 'Pat Contractor' },
  })
  fireEvent.change(screen.getByLabelText(/^License number( \*)?$/), { target: { value: 'EL-1' } })
  fireEvent.change(screen.getByLabelText(/^Result of the state lookup( \*)?$/), {
    target: { value: 'active' },
  })
  fireEvent.change(screen.getByLabelText(/^Description of work( \*)?$/), {
    target: { value: 'Panel' },
  })
}

describe('QuickIssueForm', () => {
  it('fee section shows 46.35 for card and 45.00 for cash', () => {
    form()
    expect(screen.getByTestId('fee-total').textContent).toBe('$45.00')
    fireEvent.click(screen.getByLabelText(/^Card( \*)?$/))
    expect(screen.getByTestId('fee-total').textContent).toBe('$46.35')
    expect(screen.getByText(/Convenience fee \$1\.35/)).toBeTruthy()
    fireEvent.click(screen.getByLabelText(/^Check( \*)?$/))
    expect(screen.getByTestId('fee-total').textContent).toBe('$45.00')
  })

  it('the license lookup link opens a new tab', () => {
    form()
    const link = screen.getByRole('link', { name: LOOKUP.label })
    expect(link.getAttribute('href')).toBe(LOOKUP.url)
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
  })

  it('the state lookup result starts unchosen and is required', () => {
    form()
    const select = screen.getByLabelText<HTMLSelectElement>(/^Result of the state lookup( \*)?$/)
    expect(select.value).toBe('')
    expect(select.required).toBe(true)
  })

  it('a permit type that needs no trade license asks for the applicant only', () => {
    form(idle, false)
    expect(screen.getByLabelText(/^Applicant name( \*)?$/)).toBeTruthy()
    expect(screen.queryByLabelText(/^License number( \*)?$/)).toBeNull()
    expect(screen.queryByLabelText(/^Result of the state lookup( \*)?$/)).toBeNull()
    expect(screen.queryByRole('link', { name: LOOKUP.label })).toBeNull()
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
  describe('after a declined card', () => {
    const waiting = {
      ok: true as const,
      state: 'submitted' as const,
      number: 'EL-2027-0001',
      applicationId: 'app-1',
      attemptId: 'att-1',
      links: null,
    }

    async function declineCard(issue: CounterActions['issue']) {
      form({
        ...idle,
        issue,
        reader: () => Promise.resolve({ ok: true, state: 'declined', outcomeUnknown: false }),
      })
      fillRequired()
      fireEvent.click(screen.getByLabelText(/^Card( \*)?$/))
      fireEvent.click(screen.getByRole('button', { name: 'Issue and print' }))
      await waitFor(() => expect(screen.getByRole('button', { name: 'Decline' })).toBeTruthy())
      fireEvent.click(screen.getByRole('button', { name: 'Decline' }))
      await waitFor(() => expect(screen.getByText(/Card declined/)).toBeTruthy())
    }

    it('re-enables Issue and print so staff can switch to cash without reloading', async () => {
      await declineCard(() => Promise.resolve(waiting))
      fireEvent.click(screen.getByLabelText(/^Cash( \*)?$/))
      expect(
        screen.getByRole<HTMLButtonElement>('button', { name: 'Issue and print' }).disabled,
      ).toBe(false)
    })

    it('retries on the same application instead of creating another', async () => {
      const sent: FormData[] = []
      await declineCard((data) => {
        sent.push(data)
        return Promise.resolve(
          sent.length === 1
            ? waiting
            : { ...waiting, state: 'issued' as const, attemptId: null, links: null },
        )
      })
      fireEvent.click(screen.getByLabelText(/^Cash( \*)?$/))
      fireEvent.click(screen.getByRole('button', { name: 'Issue and print' }))
      await waitFor(() => expect(sent).toHaveLength(2))
      expect(sent[0]?.get('applicationId')).toBeNull()
      expect(sent[1]?.get('applicationId')).toBe('app-1')
      expect(sent[1]?.get('method')).toBe('cash')
    })

    it('keeps Issue and print disabled while the reader is still waiting', async () => {
      form({ ...idle, issue: () => Promise.resolve(waiting) })
      fillRequired()
      fireEvent.click(screen.getByLabelText(/^Card( \*)?$/))
      fireEvent.click(screen.getByRole('button', { name: 'Issue and print' }))
      await waitFor(() => expect(screen.getByRole('button', { name: 'Approve' })).toBeTruthy())
      expect(
        screen.getByRole<HTMLButtonElement>('button', { name: 'Issue and print' }).disabled,
      ).toBe(true)
    })
  })
})
