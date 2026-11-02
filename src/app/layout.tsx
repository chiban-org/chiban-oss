import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import '@fontsource-variable/mulish'
import '@fontsource-variable/source-serif-4'
import { Providers } from '@/components/providers'
import './globals.css'

export const metadata: Metadata = {
  title: 'Chiban',
  description: 'Land-use software for small towns.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
