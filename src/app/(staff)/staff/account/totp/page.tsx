import { redirect } from 'next/navigation'
import QRCode from 'qrcode'
import { db } from '@/db/client'
import { pendingTotpUri } from '@/features/auth/totpEnrollment'
import { getActor } from '@/server/getActor'
import { BeginTotpForm, ConfirmTotpForm } from '../TotpForms'
import { EnrollmentDetails } from './EnrollmentDetails'

export default async function TotpPage() {
  const signal = AbortSignal.timeout(10_000)
  const actor = await getActor(signal)
  if (actor?.kind !== 'staff') redirect('/staff/sign-in')
  const uri = await pendingTotpUri(db, actor.userId, signal)
  const qr = uri === null ? null : await QRCode.toDataURL(uri, { margin: 1, width: 224 })

  return (
    <main className="mx-auto max-w-md p-6">
      <h1>Authenticator</h1>
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
