// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TradeFields } from './TradeFields'

afterEach(cleanup)

function renderFields(trades: string[], licenses: { trade: string; number: string }[] = []) {
  return render(
    <form>
      <TradeFields trades={trades} licenses={licenses} />
    </form>,
  )
}

describe('TradeFields', () => {
  it('shows a license field only under a trade that is checked', () => {
    renderFields([])
    expect(screen.queryByLabelText('NH license number, electrical')).toBeNull()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Electrical' }))
    expect(screen.getByLabelText('NH license number, electrical')).toBeTruthy()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Electrical' }))
    expect(screen.queryByLabelText('NH license number, electrical')).toBeNull()
  })

  it('starts with the saved trades checked and their license numbers filled', () => {
    renderFields(['plumbing'], [{ trade: 'plumbing', number: 'PL-3301' }])
    expect(screen.getByRole('checkbox', { name: 'Plumbing' }).getAttribute('aria-checked')).toBe(
      'true',
    )
    expect(screen.getByLabelText<HTMLInputElement>('NH license number, plumbing').value).toBe(
      'PL-3301',
    )
  })

  it('keeps the chosen trades checked after the form is saved and the page data refreshes', () => {
    const { rerender } = renderFields([])
    fireEvent.click(screen.getByRole('checkbox', { name: 'Electrical' }))
    rerender(
      <form>
        <TradeFields trades={['electrical']} licenses={[]} />
      </form>,
    )
    expect(screen.getByRole('checkbox', { name: 'Electrical' }).getAttribute('aria-checked')).toBe(
      'true',
    )
  })
})
