import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['pg', 'pg-boss'],
  poweredByHeader: false,
}

export default nextConfig
