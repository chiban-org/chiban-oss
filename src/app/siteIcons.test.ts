import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/headers', () => ({ cookies: () => Promise.resolve({ get: () => undefined }) }))

const { SITE_METADATA } = await import('./siteRoot')

const iconUrls = (): string[] => {
  const { icon, apple } = SITE_METADATA.icons as {
    icon: { url: string }[]
    apple: { url: string }[]
  }
  return [...icon, ...apple].map((entry) => entry.url)
}

describe('site icons', () => {
  it('declare the favicon, the large icon and the apple touch icon', () => {
    expect(iconUrls()).toEqual(['/favicon.ico', '/icon.png', '/apple-touch-icon.png'])
  })

  it('point only at files shipped in public/', () => {
    for (const url of iconUrls()) {
      expect(existsSync(join(process.cwd(), 'public', url))).toBe(true)
    }
  })
})
