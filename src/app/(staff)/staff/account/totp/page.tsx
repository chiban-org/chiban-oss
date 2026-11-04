import { redirect } from 'next/navigation'
import QRCode from 'qrcode'
import { PageHeader } from '@/components/layout/PageHeader'
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
    <main>
      <PageHeader
        title="Authenticator"
        lead="An authenticator app on your phone makes a new 6-digit code every 30 seconds. Once it is set up, signing in asks for that code after your password, so a stolen password alone cannot open your account."
      />
      <div className="flex max-w-xl flex-col gap-6">
        {uri === null || qr === null ? (
          <BeginTotpForm />
        ) : (
          <>
            <EnrollmentDetails uri={uri} qr={qr} />
            <ConfirmTotpForm />
          </>
        )}
      </div>
    </main>
  )
}
