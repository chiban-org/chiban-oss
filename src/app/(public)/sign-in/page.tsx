import { MagicLinkForm } from './MagicLinkForm'

interface SignInPageProps {
  searchParams: Promise<{ error?: string; next?: string }>
}

export default async function PublicSignInPage({ searchParams }: SignInPageProps) {
  const { error, next } = await searchParams

  return (
    <main className="mx-auto max-w-md p-6">
      <h1>Sign in</h1>
      {error === undefined ? null : (
        <p role="alert">That link is no longer valid. Request a new one.</p>
      )}
      <MagicLinkForm {...(next === undefined ? {} : { next })} />
    </main>
  )
}
