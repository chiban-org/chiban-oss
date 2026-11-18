import type { ReactNode } from 'react'
import { SITE_METADATA, SiteRoot } from '@/app/siteRoot'
import { PackTextProvider } from '@/components/PackTextProvider'
import { packText } from '@/features/packs/packText'

export const metadata = SITE_METADATA

export default function StaffRootLayout({ children }: { children: ReactNode }) {
  return (
    <SiteRoot>
      <PackTextProvider value={packText()}>{children}</PackTextProvider>
    </SiteRoot>
  )
}
