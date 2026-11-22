// @vitest-environment jsdom
import { INTERNAL_PLUMBING_STARTER } from '@packs/me/starters/internalPlumbing'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { CounterActions } from '@/components/counter/counterTypes'
import { QuickIssueForm } from '@/components/counter/QuickIssueForm'
import { LICENSE_FIELD } from '@/features/forms/formReferences'
import { questionsOf } from '@/features/forms/formSchema'

afterEach(cleanup)

const idle: CounterActions = {
  issue: () => Promise.resolve({ ok: false, error: 'not used' }),
  reader: () => Promise.resolve({ ok: false, error: 'not used' }),
  check: () => Promise.resolve({ ok: false, error: 'not used' }),
  reconnect: () => Promise.resolve({ ok: false, error: 'not used' }),
  complete: () => Promise.resolve({ ok: false, error: 'not used' }),
}

function plumbingForm() {
  return render(
    <CsrfProvider token="t1">
      <QuickIssueForm
        parcelId="p1"
        typeKey="IP"
        typeLabel="Internal plumbing permit"
        parcelLabel="014-022, 9 Vellmora Lane"
        summary={null}
        fields={questionsOf(INTERNAL_PLUMBING_STARTER.form.fields).filter(
          (f) => f.key !== LICENSE_FIELD,
        )}
        baseCents={4000}
        feeSchedule={INTERNAL_PLUMBING_STARTER.feeSchedule}
        convenienceFee={{ basisPoints: 0, fixedCents: 0, appliesTo: [] }}
        cardAvailable={false}
        readerSimulated={false}
        licenseRequired={false}
        licenseGroups={[]}
        defaultLicenseType={null}
        lookup={null}
        actions={idle}
      />
    </CsrfProvider>,
  )
}

function typeCount(label: RegExp, value: string) {
  fireEvent.input(screen.getByLabelText(label), { target: { value } })
}

describe('the counter fee as the work is entered', () => {
  it('starts at the fee for empty answers', () => {
    plumbingForm()
    expect(screen.getByTestId('fee-total').textContent).toBe('$40.00')
  })

  it('six fixtures, one sewer hook-up and work already started total $140.00', () => {
    plumbingForm()
    typeCount(/^Number of fixtures( \*)?$/, '6')
    typeCount(/^Hook-ups to a public sewer( \*)?$/, '1')
    fireEvent.click(screen.getByLabelText(/^Work started before permit( \*)?$/))
    expect(screen.getByTestId('fee-total').textContent).toBe('$140.00')
  })

  it('falls back to the fee for empty answers while a count is not a number', () => {
    plumbingForm()
    typeCount(/^Number of fixtures( \*)?$/, '6')
    typeCount(/^Hook-ups to a public sewer( \*)?$/, 'one')
    expect(screen.getByTestId('fee-total').textContent).toBe('$40.00')
  })
})
