import { SignInForm } from './SignInForm'

export default async function StaffSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ password?: string }>
}) {
  const { password } = await searchParams
  return (
    <main className="mx-auto max-w-md p-6">
      <h1>Staff sign-in</h1>
      {password === 'reset' ? (
        <p role="status" className="my-3 rounded-md bg-highlight px-3 py-2">
          Your new password is saved. Sign in with it.
        </p>
      ) : null}
      <SignInForm />
    </main>
  )
}
