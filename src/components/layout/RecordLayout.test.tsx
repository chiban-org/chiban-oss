// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RecordLayout } from './RecordLayout'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function railHeight(px: number) {
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(px)
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe = vi.fn()
      disconnect = vi.fn()
    },
  )
}

describe('RecordLayout rail', () => {
  it('keeps the rail sticky while it fits the window', () => {
    railHeight(400)
    const { container } = render(<RecordLayout rail={<p>Next step</p>}>body</RecordLayout>)
    expect(container.querySelector('aside')?.hasAttribute('data-tall')).toBe(false)
  })

  it('lets a rail taller than the window scroll with the page instead of hiding its end', () => {
    railHeight(window.innerHeight + 200)
    const { container } = render(<RecordLayout rail={<p>Next step</p>}>body</RecordLayout>)
    expect(container.querySelector('aside')?.hasAttribute('data-tall')).toBe(true)
  })
})

describe('RecordLayout section index', () => {
  it('offers the index both in the rail and in the left gutter for wide windows', () => {
    railHeight(400)
    const { container } = render(
      <RecordLayout rail={<p>Next step</p>}>
        {['Findings', 'Orders', 'Fines', 'Counsel'].map((title) => (
          <section key={title}>
            <h2>{title}</h2>
          </section>
        ))}
      </RecordLayout>,
    )
    const gutter = container.querySelector('[data-index-gutter]')
    expect(gutter?.querySelector('nav[aria-label="On this page"]')?.textContent).toContain(
      'Counsel',
    )
    expect(container.querySelector('aside nav[aria-label="On this page"]')).not.toBeNull()
  })
})
