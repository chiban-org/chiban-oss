// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AddressTextField } from '@/components/address/AddressTextField'
import { CsrfProvider } from '@/components/CsrfProvider'

const suggestAddress = vi.hoisted(() => vi.fn())
vi.mock('@/server/suggestAddress', () => ({ suggestAddress }))

const DIFFERS = { lines: ['1 MAIN ST', 'ALDER POND NH 03000-1234'], matches: false }
const MATCHES = { lines: ['1 MAIN ST', 'ALDER POND NH 03000-1234'], matches: true }

function renderField(props: { defaultValue?: string } = {}) {
  render(
    <CsrfProvider token="t1">
      <form>
        <AddressTextField label="Mailing address" name="mailingAddress" {...props} />
      </form>
    </CsrfProvider>,
  )
  return screen.getByLabelText<HTMLInputElement>('Mailing address')
}

function type(input: HTMLInputElement, value: string) {
  input.value = value
  fireEvent.input(input)
}

async function pause() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1_000)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  suggestAddress.mockReset()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('AddressTextField', () => {
  it('asks once the person pauses typing and shows the USPS suggestion under the field', async () => {
    suggestAddress.mockResolvedValue(DIFFERS)
    const input = renderField()
    type(input, '1 Main Street, Alder Pond NH')
    expect(suggestAddress).not.toHaveBeenCalled()
    await pause()
    expect(suggestAddress).toHaveBeenCalledWith({
      csrfToken: 't1',
      lines: ['1 Main Street, Alder Pond NH'],
    })
    expect(screen.getByText(/USPS suggests:/).textContent).toContain(
      '1 MAIN ST, ALDER POND NH 03000-1234',
    )
  })

  it('fills the field with the suggestion on Use this', async () => {
    suggestAddress.mockResolvedValueOnce(DIFFERS).mockResolvedValue(MATCHES)
    const input = renderField()
    type(input, '1 Main Street, Alder Pond NH')
    await pause()
    fireEvent.click(screen.getByRole('button', { name: 'Use this' }))
    expect(input.value).toBe('1 MAIN ST, ALDER POND NH 03000-1234')
    await pause()
    expect(screen.queryByText(/USPS suggests:/)).toBeNull()
    expect(screen.getByText('Matches the USPS address')).toBeTruthy()
  })

  it('asks right away when the person leaves the field, and not again for the same text', async () => {
    suggestAddress.mockResolvedValue(MATCHES)
    const input = renderField()
    type(input, '1 Main St, Alder Pond NH 03000-1234')
    await act(async () => {
      fireEvent.blur(input)
      await Promise.resolve()
    })
    expect(suggestAddress).toHaveBeenCalledTimes(1)
    await pause()
    expect(suggestAddress).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Matches the USPS address')).toBeTruthy()
  })

  it('does not ask about a value the person has not touched', async () => {
    const input = renderField({ defaultValue: '1 Main St, Alder Pond NH' })
    fireEvent.focus(input)
    fireEvent.blur(input)
    await pause()
    expect(suggestAddress).not.toHaveBeenCalled()
  })

  it('shows nothing when USPS has nothing or the request fails', async () => {
    suggestAddress.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('offline'))
    const input = renderField()
    type(input, '1 Main Street, Alder Pond NH')
    await pause()
    type(input, '2 Main Street, Alder Pond NH')
    await pause()
    expect(suggestAddress).toHaveBeenCalledTimes(2)
    expect(screen.queryByText(/USPS/)).toBeNull()
  })

  it('ignores an answer for text the person has since changed', async () => {
    let answer: (value: unknown) => void = () => undefined
    suggestAddress.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)))
    suggestAddress.mockResolvedValue(null)
    const input = renderField()
    type(input, '1 Main Street, Alder Pond NH')
    await pause()
    type(input, '1 Main Street, Alder Pond NH 0')
    await act(async () => {
      answer(DIFFERS)
      await Promise.resolve()
    })
    expect(screen.queryByText(/USPS suggests:/)).toBeNull()
  })

  it('submits under its own name like a plain text field', () => {
    const input = renderField({ defaultValue: '1 Main St' })
    expect(input.name).toBe('mailingAddress')
    expect(input.value).toBe('1 Main St')
  })
})
