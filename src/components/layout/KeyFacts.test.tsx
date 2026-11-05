// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { KeyFacts } from './KeyFacts'

afterEach(cleanup)

describe('KeyFacts', () => {
  it('holds the page facts together in one strip with the footnote under them', () => {
    const { container } = render(
      <KeyFacts note="Lists still issue.">
        <p>1 due for a check.</p>
        <p>Contacts are due for a check every 365 days.</p>
      </KeyFacts>,
    )
    const strip = container.querySelector('[data-slot="key-facts"]')
    expect(strip?.textContent).toContain('1 due for a check.')
    expect(strip?.textContent).toContain('every 365 days')
    expect(strip?.lastElementChild?.textContent).toBe('Lists still issue.')
  })

  it('leaves out the footnote when there is none', () => {
    render(
      <KeyFacts>
        <p>Only fact</p>
      </KeyFacts>,
    )
    expect(screen.getByText('Only fact').closest('[data-slot="key-facts"]')?.children).toHaveLength(
      1,
    )
  })

  it('stacks long statements one per line when asked', () => {
    render(
      <KeyFacts stacked>
        <p>Anonymous complaints are not being accepted.</p>
        <p>The version running now has no passing retention check.</p>
      </KeyFacts>,
    )
    const row = screen.getByText(/not being accepted/).parentElement
    expect(row?.className).toContain('grid')
    expect(row?.className).not.toContain('flex')
  })
})
