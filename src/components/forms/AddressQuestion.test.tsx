// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import { FormRenderer } from '@/components/forms/FormRenderer'
import type { FormBody } from '@/features/forms/formSchema'

const suggestAddress = vi.hoisted(() => vi.fn())
vi.mock('@/server/suggestAddress', () => ({ suggestAddress }))

const FORM: FormBody = {
  key: 'zba',
  label: 'Variance',
  fields: [
    { key: 'applicant_name', label: 'Applicant name', type: 'text', required: true },
    {
      key: 'applicant_mailing_address',
      label: 'Applicant mailing address',
      type: 'text',
      required: true,
    },
    { key: 'owner_address', label: 'Owner mailing address', type: 'textarea', required: false },
  ],
}

function Applicant({ addressChecks }: { addressChecks: boolean }) {
  const [values, setValues] = useState<Record<string, unknown>>({})
  return (
    <CsrfProvider token="t1">
      <FormRenderer
        form={FORM}
        values={values}
        errors={{}}
        addressChecks={addressChecks}
        onChange={(key, value) => setValues((v) => ({ ...v, [key]: value }))}
      />
    </CsrfProvider>
  )
}

async function pause() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1_000)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  suggestAddress.mockReset()
  suggestAddress.mockResolvedValue({
    lines: ['12 OSPREY LN', 'ALDER POND NH 03999-0012'],
    matches: false,
  })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('address questions on the applicant form', () => {
  it('suggests the USPS address under a mailing address question and fills it on Use this', async () => {
    render(<Applicant addressChecks />)
    const input = screen.getByLabelText<HTMLInputElement>(/^Applicant\ mailing\ address( \*)?$/)
    fireEvent.change(input, { target: { value: '12 Osprey Lane, Alder Pond NH' } })
    await pause()
    fireEvent.click(screen.getByRole('button', { name: 'Use this' }))
    expect(input.value).toBe('12 OSPREY LN, ALDER POND NH 03999-0012')
  })

  it('fills a box question one line per address line', async () => {
    render(<Applicant addressChecks />)
    const box = screen.getByLabelText<HTMLTextAreaElement>('Owner mailing address')
    fireEvent.change(box, { target: { value: '12 Osprey Lane\nAlder Pond NH' } })
    await pause()
    fireEvent.click(screen.getByRole('button', { name: 'Use this' }))
    expect(box.value).toBe('12 OSPREY LN\nALDER POND NH 03999-0012')
  })

  it('leaves other questions alone', async () => {
    render(<Applicant addressChecks />)
    fireEvent.change(screen.getByLabelText(/^Applicant\ name( \*)?$/), {
      target: { value: '12 Osprey Lane, Alder Pond NH' },
    })
    await pause()
    expect(suggestAddress).not.toHaveBeenCalled()
  })

  it('checks nothing where the form is shown without address checks', async () => {
    render(<Applicant addressChecks={false} />)
    fireEvent.change(screen.getByLabelText(/^Applicant\ mailing\ address( \*)?$/), {
      target: { value: '12 Osprey Lane, Alder Pond NH' },
    })
    await pause()
    expect(suggestAddress).not.toHaveBeenCalled()
  })
})
