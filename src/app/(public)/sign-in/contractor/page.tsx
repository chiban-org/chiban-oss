import type { Metadata } from 'next'
import Link from 'next/link'
import { MagicLinkForm } from '../MagicLinkForm'

export const metadata: Metadata = { title: 'Create a contractor account' }

const CONTRACTOR_SETUP_PATH = '/account?setup=contractor'

export default function ContractorSignUpPage() {
  return (
    <main className="mx-auto max-w-md space-y-4 p-6">
      <h1>Create a contractor account</h1>
      <p>
        See every project that names you as the contractor on one page. Enter your work email. We
        send a link to confirm it, then you fill in your company details.
      </p>
      <p className="text-muted-foreground">
        The town does not register or license contractors and charges no fee. Projects show up when
        the town or the property owner names your email as the contractor.
      </p>
      <MagicLinkForm next={CONTRACTOR_SETUP_PATH} />
      <p>
        <Link href="/sign-in">Back to sign in</Link>
      </p>
    </main>
  )
}
