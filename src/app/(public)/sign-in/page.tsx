import type { Metadata } from 'next'
import Link from 'next/link'
import { MagicLinkForm } from './MagicLinkForm'

export const metadata: Metadata = { title: 'Sign in' }

interface SignInPageProps {
  searchParams: Promise<{ error?: string; next?: string }>
}

export default async function PublicSignInPage({ searchParams }: SignInPageProps) {
  const { error, next } = await searchParams

  return (
    <main className="mx-auto max-w-md p-6">
      <h1>Sign in</h1>
      <p className="text-lg">
        New or returning, enter your email. We will send a link. No password.
      </p>
      {error === undefined ? null : (
        <p role="alert">That link is no longer valid. Request a new one.</p>
      )}
      <MagicLinkForm {...(next === undefined ? {} : { next })} />
      <p className="mt-6">
        {'Contractor? '}
        <Link href="/sign-in/contractor">Create a contractor account</Link>
      </p>
    </main>
  )
}
