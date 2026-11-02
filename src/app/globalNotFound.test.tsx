import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const reads = vi.hoisted(() => ({ cookies: 0 }))

vi.mock('next/headers', () => ({
  cookies: () => {
    reads.cookies += 1
    return Promise.resolve({ get: () => undefined })
  },
}))

const { default: GlobalNotFound } = await import('./global-not-found')

describe('global not found page', () => {
  it('carries the site header linking home, like the not-found pages inside the site', () => {
    const html = renderToStaticMarkup(<GlobalNotFound />)
    expect(html).toMatch(/<header[^>]*>.*<a href="\/"[^>]*>Town of Alder Pond<\/a>.*<\/header>/s)
    expect(html).toContain('Page not found')
  })

  it('reads no cookie, so an unknown address under the anonymous report path stays sessionless', () => {
    renderToStaticMarkup(<GlobalNotFound />)
    expect(reads.cookies).toBe(0)
  })
})
