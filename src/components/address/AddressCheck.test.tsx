// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AddressCheck } from '@/components/address/AddressCheck'
import { CsrfProvider } from '@/components/CsrfProvider'

const suggestAddress = vi.hoisted(() => vi.fn())
vi.mock('@/server/suggestAddress', () => ({ suggestAddress }))

const DIFFERS = {
  lines: ['Land Use Office', '1 MAIN ST', 'ALDER POND NH 03000-1234'],
  matches: false,
}

function Lines({ max }: { max: number }) {
  const [lines, setLines] = useState(['Land Use Office', '', ''])
  return (
    <AddressCheck lines={lines} maxLines={max} onUse={setLines}>
      {lines.map((line, index) => (
        <label key={`line-${String(index)}`}>
          {`Line ${String(index + 1)}`}
          <input
            value={line}
            onChange={(e) => setLines(lines.map((l, i) => (i === index ? e.target.value : l)))}
          />
        </label>
      ))}
      <button type="button">Add a line</button>
    </AddressCheck>
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
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('AddressCheck', () => {
  it('checks the lines together and fills each line on Use this', async () => {
    suggestAddress.mockResolvedValue(DIFFERS)
    render(
      <CsrfProvider token="t1">
        <Lines max={3} />
      </CsrfProvider>,
    )
    fireEvent.change(screen.getByLabelText('Line 2'), { target: { value: '1 Main Street' } })
    fireEvent.change(screen.getByLabelText('Line 3'), { target: { value: 'Alder Pond NH' } })
    await pause()
    expect(suggestAddress).toHaveBeenCalledTimes(1)
    expect(suggestAddress).toHaveBeenCalledWith({
      csrfToken: 't1',
      lines: ['Land Use Office', '1 Main Street', 'Alder Pond NH'],
    })
    fireEvent.click(screen.getByRole('button', { name: 'Use this' }))
    expect(screen.getByLabelText<HTMLInputElement>('Line 2').value).toBe('1 MAIN ST')
    expect(screen.getByLabelText<HTMLInputElement>('Line 3').value).toBe('ALDER POND NH 03000-1234')
  })

  it('folds the suggestion into the lines the layout allows', async () => {
    suggestAddress.mockResolvedValue(DIFFERS)
    const onUse = vi.fn()
    const { rerender } = render(
      <CsrfProvider token="t1">
        <AddressCheck
          lines={['Land Use Office, 1 Main St, Alder Pond NH']}
          maxLines={2}
          onUse={onUse}
        >
          <span />
        </AddressCheck>
      </CsrfProvider>,
    )
    rerender(
      <CsrfProvider token="t1">
        <AddressCheck
          lines={['Land Use Office, 1 Main St, Alder Pond NH 0']}
          maxLines={2}
          onUse={onUse}
        >
          <span />
        </AddressCheck>
      </CsrfProvider>,
    )
    await pause()
    fireEvent.click(screen.getByRole('button', { name: 'Use this' }))
    expect(onUse).toHaveBeenCalledWith(['Land Use Office, 1 MAIN ST', 'ALDER POND NH 03000-1234'])
  })

  it('checks when focus leaves the group, not when it moves inside it', async () => {
    suggestAddress.mockResolvedValue(null)
    render(
      <CsrfProvider token="t1">
        <Lines max={3} />
      </CsrfProvider>,
    )
    const line2 = screen.getByLabelText('Line 2')
    fireEvent.change(line2, { target: { value: '1 Main Street, 03000' } })
    fireEvent.blur(line2, { relatedTarget: screen.getByRole('button', { name: 'Add a line' }) })
    expect(suggestAddress).not.toHaveBeenCalled()
    await act(async () => {
      fireEvent.blur(line2, { relatedTarget: null })
      await Promise.resolve()
    })
    expect(suggestAddress).toHaveBeenCalledTimes(1)
  })
})
