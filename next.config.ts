import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['pg', 'pg-boss', 'better-sqlite3'],
  poweredByHeader: false,
}

export default nextConfig
