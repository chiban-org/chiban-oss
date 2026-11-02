import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import type { ReactNode } from 'react'
import '@fontsource-variable/mulish'
import '@fontsource-variable/source-serif-4'
import { CsrfProvider } from '@/components/CsrfProvider'
import { Providers } from '@/components/providers'
import { CSRF_COOKIE } from '@/constants/cookies'
import './globals.css'

export const metadata: Metadata = {
  title: 'Chiban',
  description: 'Land-use software for small towns.',
}

export default async function RootLayout({ children }: { children: ReactNode }) {
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
