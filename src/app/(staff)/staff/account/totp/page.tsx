import { redirect } from 'next/navigation'
import QRCode from 'qrcode'
import { db } from '@/db/client'
import { pendingTotpUri } from '@/features/auth/totpEnrollment'
import { requireStaffActor } from '@/server/requireStaff'
import { BeginTotpForm, ConfirmTotpForm } from '../TotpForms'
import { EnrollmentDetails } from './EnrollmentDetails'

export default async function TotpPage() {
  const signal = AbortSignal.timeout(10_000)
  const actor = await requireStaffActor(signal)
  const uri = await pendingTotpUri(db, actor.userId, signal)
  const qr = uri === null ? null : await QRCode.toDataURL(uri, { margin: 1, width: 224 })

  return (
    <main className="mx-auto max-w-md p-6">
      <h1>Authenticator</h1>
      <p>
        An authenticator app on your phone makes a new 6-digit code every 30 seconds. Once it is set
        up, signing in asks for that code after your password, so a stolen password alone cannot
        open your account.
      </p>
      {uri === null || qr === null ? (
        <BeginTotpForm />
      ) : (
        <>
          <EnrollmentDetails uri={uri} qr={qr} />
          <ConfirmTotpForm />
        </>
      )}
    </main>
  )
}
