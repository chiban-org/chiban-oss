import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const reads = vi.hoisted(() => ({ cookies: 0 }))

vi.mock('next/headers', () => ({
  cookies: () => {
    reads.cookies += 1
    return Promise.resolve({ get: () => undefined })
  },
}))
vi.mock('next/navigation', () => ({ usePathname: () => '/nowhere' }))
vi.mock('@/db/client', () => ({ db: {} }))
vi.mock('@/features/town/publicTown', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/town/publicTown')>()),
  loadPublicTown: () =>
    Promise.resolve({
      name: 'Town of Birch Hollow',
      office: {
        officeName: 'Land Use Office',
        addressLines: ['1 Main Street'],
        phone: '603-555-0100',
        email: '',
        officeHours: '',
      },
      logo: null,
    }),
}))

const { default: GlobalNotFound } = await import('./global-not-found')

describe('global not found page', () => {
  it('carries the town header linking home and the town footer, like the pages inside the site', async () => {
    const html = renderToStaticMarkup(await GlobalNotFound())
    expect(html).toMatch(
      /<header[^>]*>.*<a href="\/"[^>]*>.*Town of Birch Hollow.*<\/a>.*<\/header>/s,
    )
    expect(html).toMatch(/<footer[\s\S]*603-555-0100[\s\S]*<\/footer>/)
    expect(html).toContain('Page not found')
  })

  it('reads no cookie, so an unknown address under the anonymous report path stays sessionless', async () => {
    renderToStaticMarkup(await GlobalNotFound())
    expect(reads.cookies).toBe(0)
  })
})
