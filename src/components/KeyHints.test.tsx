// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { KeyHints } from '@/components/KeyHints'
import { KBD_CLASS } from '@/components/ui/kbd'

afterEach(cleanup)

describe('KeyHints', () => {
  it('renders every key in a kbd element with the shared class', () => {
    const { container } = render(
      <KeyHints
        hints={[
          { keys: ['j', 'k'], action: 'move' },
          { keys: ['Enter'], action: 'open' },
        ]}
      />,
    )
    const keys = [...container.querySelectorAll('kbd')]
    expect(keys.map((k) => k.textContent)).toEqual(['j', 'k', 'Enter'])
    for (const key of keys) expect(key.className).toContain(KBD_CLASS)
  })

  it('pairs each key group with its lowercase action', () => {
    const { container } = render(<KeyHints hints={[{ keys: ['j', 'k'], action: 'move' }]} />)
    expect(container.textContent.replace(/\s+/g, ' ').trim()).toBe('j k move')
  })
})
