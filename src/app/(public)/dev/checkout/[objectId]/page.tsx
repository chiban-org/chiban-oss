import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ActionForm } from '@/components/ActionForm'
import { env } from '@/config/env'
import { db } from '@/db/client'
import { loadDevCheckout } from '@/features/payments/simulatedCheckout'
import { formatCents } from '@/lib/money'
import { approveCheckoutAction, declineCheckoutAction } from './actions'

export const dynamic = 'force-dynamic'

export default async function DevCheckoutPage({
  params,
}: {
  params: Promise<{ objectId: string }>
}) {
  const { objectId } = await params
  const view = await loadDevCheckout(
    db,
    objectId,
    { enabled: env.ENABLE_SIMULATED_PAYMENTS },
    AbortSignal.timeout(10_000),
  )
  if (view === null) notFound()
  return (
    <main className="mx-auto max-w-md space-y-4 p-6">
      <h1>Simulated checkout</h1>
      <p role="note" className="rounded-md border p-3 font-semibold">
        SIMULATED: this page is not connected to a live processor. No card is charged.
      </p>
      <p>Amount: {formatCents(view.amountCents)}</p>
      {view.status === 'pending' ? (
        <div className="flex flex-wrap gap-3">
          <ActionForm action={approveCheckoutAction} submitLabel="Approve" variant="default">
            <input type="hidden" name="objectId" value={view.objectId} />
          </ActionForm>
          <ActionForm action={declineCheckoutAction} submitLabel="Decline">
            <input type="hidden" name="objectId" value={view.objectId} />
          </ActionForm>
        </div>
      ) : (
        <p>
          This checkout was already completed.{' '}
          <Link href={`/payments/return/${view.attemptId}`}>See the result</Link>
        </p>
      )}
    </main>
  )
}
