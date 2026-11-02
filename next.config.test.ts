import { describe, expect, it } from 'vitest'
import nextConfig from './next.config'

async function resolvedHeaders(): Promise<
  { source: string; headers: { key: string; value: string }[] }[]
> {
  const headers = nextConfig.headers
  if (headers === undefined) throw new Error('headers missing')
  return await headers()
}

describe('next config headers', () => {
  it('sends frame-ancestors none on every path', async () => {
    const rules = await resolvedHeaders()
    const rule = rules.find((r) => r.source === '/:path*')
    expect(rule).toBeDefined()
    const csp = rule?.headers.find((h) => h.key === 'Content-Security-Policy')
    expect(csp?.value).toBe("frame-ancestors 'none'")
  })

  it('sends the other hardening headers on every path', async () => {
    const rules = await resolvedHeaders()
    const map = new Map(
      rules.find((r) => r.source === '/:path*')?.headers.map((h) => [h.key, h.value]),
    )
    expect(map.get('X-Frame-Options')).toBe('DENY')
    expect(map.get('X-Content-Type-Options')).toBe('nosniff')
    expect(map.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
  })

  it('sends no-referrer and no-store for the anonymous paths after the general rule', async () => {
    const rules = await resolvedHeaders()
    const general = rules.findIndex((r) => r.source === '/:path*')
    for (const prefix of ['/report-anonymously', '/intake/anonymous']) {
      const index = rules.findIndex((r) => r.source === `${prefix}/:path*`)
      expect(index).toBeGreaterThan(general)
      const map = new Map(rules[index]?.headers.map((h) => [h.key, h.value]))
      expect(map.get('Referrer-Policy')).toBe('no-referrer')
      expect(map.get('Cache-Control')).toBe('no-store')
    }
  })

  it('keeps the existing server settings', () => {
    expect(nextConfig.poweredByHeader).toBe(false)
    expect(nextConfig.serverExternalPackages).toEqual(['pg', 'pg-boss', 'better-sqlite3', 'mupdf'])
  })
})

describe('next config externals', () => {
  it('keeps the WebAssembly redaction engine out of the server bundle', () => {
    expect(nextConfig.serverExternalPackages).toContain('mupdf')
  })
})
