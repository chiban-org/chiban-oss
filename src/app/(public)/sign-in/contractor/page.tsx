import type { Metadata } from 'next'
import Link from 'next/link'
import { db } from '@/db/client'
import { MAGIC_LINK_TTL_MINUTES } from '@/features/auth/magicLink'
import { getTownSettings } from '@/features/town/settings'
import { ContractorSignUpForm } from './ContractorSignUpForm'

export const metadata: Metadata = { title: 'Create a contractor account' }

export const dynamic = 'force-dynamic'

const SIGN_IN_TO_PROJECTS = '/sign-in?next=%2Fportal%2Fcontractor'
const FALLBACK_TOWN = 'the town'
const PAGE_TIMEOUT_MS = 15_000

export default async function ContractorSignUpPage() {
  const town = await getTownSettings(db, AbortSignal.timeout(PAGE_TIMEOUT_MS))
  return (
    <main className="mx-auto max-w-md space-y-4 p-6">
      <h1>Create a contractor account</h1>
      <p>
        See every project that names you as the contractor on one page. Enter your work email. This
        creates a new account for that address, and we send a link to confirm it. Then you fill in
        your company details.
      </p>
      <p className="text-muted-foreground">
        The town does not register or license contractors and charges no fee. Projects show up when
        the town or the property owner names your email as the contractor.
      </p>
      <ContractorSignUpForm
        townName={town.ok ? town.value.name : FALLBACK_TOWN}
        linkMinutes={MAGIC_LINK_TTL_MINUTES}
      />
      <p>
        {'Already have an account? '}
        <Link href={SIGN_IN_TO_PROJECTS}>Sign in</Link>
      </p>
      <p>
        <Link href="/sign-in">Back to sign in</Link>
      </p>
    </main>
  )
}
