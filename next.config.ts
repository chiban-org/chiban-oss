import type { NextConfig } from 'next'
import { ANONYMOUS_PREFIXES } from './src/constants/anonymousRoutes'

const nextConfig: NextConfig = {
  serverExternalPackages: ['pg', 'pg-boss', 'better-sqlite3', 'mupdf'],
  poweredByHeader: false,
  experimental: { globalNotFound: true },
  headers() {
    return Promise.resolve([
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
      ...ANONYMOUS_PREFIXES.map((prefix) => ({
        source: `${prefix}/:path*`,
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Cache-Control', value: 'no-store' },
        ],
      })),
    ])
  },
}

export default nextConfig
