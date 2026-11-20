import type { ReactNode } from 'react'
import { SITE_METADATA, SiteRoot } from '@/app/siteRoot'

export const metadata = SITE_METADATA

export default function StaffRootLayout({ children }: { children: ReactNode }) {
  return <SiteRoot>{children}</SiteRoot>
}
