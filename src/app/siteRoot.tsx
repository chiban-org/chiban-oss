import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import type { ReactNode } from 'react'
import '@fontsource-variable/mulish'
import '@fontsource-variable/source-serif-4'
import { CsrfProvider } from '@/components/CsrfProvider'
import { Providers } from '@/components/providers'
import { CSRF_COOKIE } from '@/constants/cookies'
import './globals.css'

export const SITE_METADATA: Metadata = {
  title: { default: 'Chiban', template: '%s · Chiban' },
  description: 'Land-use software for small towns.',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '16x16 32x32 48x48' },
      { url: '/icon.png', type: 'image/png', sizes: '512x512' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
}

export function townSiteTitle(townName: string): Metadata['title'] {
  return { default: townName, template: `%s · ${townName}` }
}

export function townSiteMetadata(townName: string): Metadata {
  return {
    ...SITE_METADATA,
    title: townSiteTitle(townName),
    description: `${townName} land use records.`,
  }
}

export async function SiteRoot({ children }: { children: ReactNode }) {
  const token = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  return (
    <html lang="en">
      <body>
        <CsrfProvider token={token}>
          <Providers>{children}</Providers>
        </CsrfProvider>
      </body>
    </html>
  )
}
