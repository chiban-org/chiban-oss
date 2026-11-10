import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const reads = vi.hoisted(() => ({ cookies: 0, town: 0, prerendering: false }))

vi.mock('next/headers', () => ({
  cookies: () => {
    reads.cookies += 1
    return Promise.resolve({ get: () => undefined })
  },
}))
vi.mock('next/navigation', () => ({ usePathname: () => '/nowhere' }))
vi.mock('next/server', () => ({
  connection: () => {
    if (reads.prerendering) throw new Error('prerender bail-out')
    return Promise.resolve()
  },
}))
vi.mock('@/db/client', () => ({ db: {} }))
vi.mock('@/features/town/publicTown', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/town/publicTown')>()),
  loadPublicTown: () => {
    reads.town += 1
    return Promise.resolve({
      name: 'Town of Birch Hollow',
      office: {
        officeName: 'Land Use Office',
        addressLines: ['1 Main Street'],
        phone: '603-555-0100',
        email: '',
        officeHours: '',
      },
      logo: null,
    })
  },
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

  it('waits for a real request before reading the town, so the build needs no database', async () => {
    reads.prerendering = true
    const before = reads.town
    try {
      await expect(GlobalNotFound()).rejects.toThrow('prerender bail-out')
    } finally {
      reads.prerendering = false
    }
    expect(reads.town).toBe(before)
  })
})
