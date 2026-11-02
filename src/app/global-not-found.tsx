import type { Metadata } from 'next'
import '@fontsource-variable/mulish'
import '@fontsource-variable/source-serif-4'
import { NotFoundPage } from '@/components/NotFoundPage'
import './globals.css'

export const metadata: Metadata = { title: 'Page not found' }

export default function GlobalNotFound() {
  return (
    <html lang="en">
      <body>
        <NotFoundPage />
      </body>
    </html>
  )
}
