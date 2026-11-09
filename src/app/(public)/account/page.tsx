import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { loadAccountView } from '@/features/contractors/accountView'
import { requirePortalContext } from '@/server/requirePortal'
import { ContractorForm, PersonForm } from './AccountForms'

export const metadata: Metadata = { title: 'Your account' }

export const dynamic = 'force-dynamic'

const LINK = 'tap-target inline-flex items-center'

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ setup?: string }>
}) {
  const { setup } = await searchParams
  const ctx = await requirePortalContext('/account')
  if (ctx.actor.kind === 'staff') redirect('/staff/account')
  const view = await loadAccountView(ctx.db, ctx.actor.userId, ctx.signal)
  if (view === null) redirect('/sign-in?next=%2Faccount')
  if (setup === 'contractor' && view.contractor !== null) redirect('/portal/contractor')
  const contractor = view.contractor !== null || view.namedAsContractor || setup === 'contractor'
  return (
    <main className="max-w-2xl space-y-6">
      <h1>Your account</h1>
      {contractor ? (
        <section aria-labelledby="contractor-profile">
          <h2 id="contractor-profile">Contractor profile</h2>
          <p>
            The town uses this to reach you about your permits. Projects that name your email as the
            contractor show on your <Link href="/portal/contractor">contractor projects</Link> page.
            There is no registration fee, and the town checks state licenses when a trade permit is
            pulled.
          </p>
          <ContractorForm view={view} />
        </section>
      ) : (
        <>
          <section aria-labelledby="your-details">
            <h2 id="your-details">Your details</h2>
            <PersonForm view={view} />
          </section>
          <section aria-labelledby="contractor-signup">
            <h2 id="contractor-signup">Are you a contractor?</h2>
            <p>
              Set up a contractor profile to see every project that names you as the contractor on
              one page.
            </p>
            <Link href="/account?setup=contractor" className={LINK}>
              Set up a contractor profile
            </Link>
          </section>
        </>
      )}
    </main>
  )
}
