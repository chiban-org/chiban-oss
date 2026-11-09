import type { Metadata } from 'next'
import { ActionForm } from '@/components/ActionForm'
import { db } from '@/db/client'
import { findAlertTest } from '@/features/health/syntheticAlert'
import { acknowledgeAlertAction } from './actions'

export const metadata: Metadata = { title: 'Alert test' }

export const dynamic = 'force-dynamic'

const TIMEOUT_MS = 10_000
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{20,100}$/

export default async function AckPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const found = TOKEN_SHAPE.test(token)
    ? await findAlertTest(db, token, AbortSignal.timeout(TIMEOUT_MS))
    : null
  if (found === null) {
    return (
      <main>
        <h1>Alert test</h1>
        <p role="alert">This link is no longer valid.</p>
      </main>
    )
  }
  return (
    <main>
      <h1>Alert test</h1>
      {found.acknowledgedAt === null ? (
        <>
          <p>This is a test of the town's alert path. Confirm that it reached you.</p>
          <ActionForm
            action={acknowledgeAlertAction}
            submitLabel="Confirm I received this alert"
            variant="default"
          >
            <input type="hidden" name="token" value={token} />
          </ActionForm>
        </>
      ) : (
        <p role="status">Your confirmation has been recorded.</p>
      )}
    </main>
  )
}
