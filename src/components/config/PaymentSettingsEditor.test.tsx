// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PaymentSettingsEditor } from '@/components/config/PaymentSettingsEditor'
import type { PaymentSettingsBody } from '@/features/payments/settingsSchema'

afterEach(cleanup)

const BODY: PaymentSettingsBody = {
  key: 'default',
  convenienceFee: { basisPoints: 0, fixedCents: 0, appliesTo: [] },
  receiptFooter: '',
  checksPayableTo: '',
}

function show(townName: string) {
  render(
    <PaymentSettingsEditor
      body={BODY}
      townName={townName}
      onChange={() => undefined}
      errors={{}}
    />,
  )
}

describe('PaymentSettingsEditor checks payable hint', () => {
  it('names the town in the example', () => {
    show('Town of Fernhollow')
    expect(
      screen.getByText('Printed on invoices and receipts, for example Town of Fernhollow.'),
    ).toBeTruthy()
  })

  it('gives no example when the town has no name', () => {
    show('')
    expect(screen.getByText('Printed on invoices and receipts.')).toBeTruthy()
  })
})
