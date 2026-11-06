import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

export const metadata: Metadata = { title: 'Your account' }

export default function AccountPage(): never {
  redirect('/portal')
}
