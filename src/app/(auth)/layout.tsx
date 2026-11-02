import type { ReactNode } from 'react'
import { SITE_METADATA, SiteRoot } from '@/app/siteRoot'

export const metadata = SITE_METADATA

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <SiteRoot>{children}</SiteRoot>
}
