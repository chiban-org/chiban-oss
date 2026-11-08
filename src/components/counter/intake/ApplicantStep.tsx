import { ActionForm } from '@/components/ActionForm'
import { TextField } from '@/components/staff/fields'
import { Button } from '@/components/ui/button'
import type { ApplicantAccount } from '@/features/counter/intake/applicantAccount'
import type { ActionResult } from '@/server/actionRunner'

export interface ApplicantChoice {
  parcelId: string
  typeKey: string
  q: string
  email: string
  account: ApplicantAccount | null
}

interface Props {
  choice: ApplicantChoice
  start: (formData: FormData) => Promise<ActionResult>
}

function Chosen({ choice }: { choice: ApplicantChoice }) {
  return (
    <>
      <input type="hidden" name="parcelId" value={choice.parcelId} />
      <input type="hidden" name="applicationTypeKey" value={choice.typeKey} />
    </>
  )
}

function AccountFound({ choice, account, start }: Props & { account: ApplicantAccount }) {
  return (
    <div className="flex flex-col gap-3">
      <p role="status">
        {`${account.name} has an account with this email. The application will be theirs: it shows in their portal and the notices go to them.`}
      </p>
      <ActionForm
        action={start}
        submitLabel={`Take the application for ${account.name}`}
        variant="default"
      >
        <Chosen choice={choice} />
        <input type="hidden" name="email" value={account.email} />
      </ActionForm>
    </div>
  )
}

function NoAccount({ choice, start }: Props) {
  return (
    <div className="flex flex-col gap-3">
      <p role="status">
        {`No account uses ${choice.email}. Record the applicant on the application. After it is submitted you can send them a claim link so they can follow it online.`}
      </p>
      <ActionForm action={start} submitLabel="Take the application" variant="default">
        <Chosen choice={choice} />
        <input type="hidden" name="email" value={choice.email} />
        <TextField label="Applicant name" name="name" autoComplete="off" required />
      </ActionForm>
    </div>
  )
}

function NoEmail({ choice, start }: Props) {
  return (
    <details>
      <summary>The applicant has no email address</summary>
      <ActionForm action={start} submitLabel="Take the application">
        <Chosen choice={choice} />
        <TextField label="Applicant name" name="name" autoComplete="off" required />
      </ActionForm>
    </details>
  )
}

export function ApplicantStep({ choice, start }: Props) {
  const searched = choice.email !== ''
  return (
    <section aria-labelledby="applicant" className="flex flex-col gap-4">
      <h2 id="applicant">Applicant</h2>
      <form method="get" role="search" className="flex max-w-3xl gap-3">
        <input type="hidden" name="type" value={choice.typeKey} />
        <input type="hidden" name="parcel" value={choice.parcelId} />
        {choice.q === '' ? null : <input type="hidden" name="q" value={choice.q} />}
        <div className="flex-1">
          <TextField
            label="Applicant email"
            name="applicant"
            type="email"
            defaultValue={choice.email}
            hint="An applicant with an account gets the application in their portal."
          />
        </div>
        <Button type="submit" className="self-end">
          Find account
        </Button>
      </form>
      {searched && choice.account !== null ? (
        <AccountFound choice={choice} account={choice.account} start={start} />
      ) : null}
      {searched && choice.account === null ? <NoAccount choice={choice} start={start} /> : null}
      {searched ? null : <NoEmail choice={choice} start={start} />}
    </section>
  )
}
