import Link from 'next/link'
import { ActionForm } from '@/components/ActionForm'
import { TextField } from '@/components/staff/fields'
import type { CaseDetail } from '@/features/enforcement/caseDetail'
import type { CaseRemedies } from '@/features/enforcement/caseRemedies'
import { cureStanding } from '@/features/enforcement/cureStanding'
import type { HeldPermit } from '@/features/enforcement/holdPermits'
import { formatCivilDate } from '@/lib/formatDate'
import {
  placeDevelopmentHoldAction,
  recordCivilActionAction,
  releaseDevelopmentHoldAction,
  revokeUnderHoldAction,
  suspendUnderHoldAction,
} from '../holdActions'
import type { Can } from './can'
import { Hidden } from './Section'

type Variant = 'default' | 'outline'
type Hold = CaseRemedies['holds'][number]

function DateField({ label, name, today }: { label: string; name: string; today: string }) {
  return <TextField label={label} name={name} type="date" defaultValue={today} required />
}

export function PlaceHoldForm({ detail, variant }: { detail: CaseDetail; variant: Variant }) {
  return (
    <ActionForm action={placeDevelopmentHoldAction} submitLabel="Place hold" variant={variant}>
      <Hidden name="caseId" value={detail.staff.row.id} />
      <DateField label="Date the hold is placed" name="placedOn" today={detail.today} />
    </ActionForm>
  )
}

export function CivilActionForm({ detail, variant }: { detail: CaseDetail; variant: Variant }) {
  return (
    <ActionForm
      action={recordCivilActionAction}
      submitLabel="Record civil action"
      variant={variant}
    >
      <Hidden name="caseId" value={detail.staff.row.id} />
      <DateField label="Date filed" name="filedOn" today={detail.today} />
      <TextField label="Court" name="court" required />
      <TextField label="Docket number, if assigned" name="docket" />
    </ActionForm>
  )
}

function PermitFields({ hold, permit, today }: { hold: Hold; permit: HeldPermit; today: string }) {
  return (
    <>
      <Hidden name="holdId" value={hold.id} />
      <Hidden name="applicationId" value={permit.applicationId} />
      <DateField label="Date" name="actedOn" today={today} />
    </>
  )
}

function SuspendForm(props: { hold: Hold; permit: HeldPermit; today: string }) {
  return (
    <details>
      <summary>Suspend</summary>
      <ActionForm
        action={suspendUnderHoldAction}
        submitLabel="Suspend permit"
        variant="outline"
        confirm={{
          title: `Suspend permit ${props.permit.number}?`,
          body: 'Inspections and certificates stop until the hold is released.',
          confirmLabel: 'Suspend permit',
        }}
      >
        <PermitFields {...props} />
      </ActionForm>
    </details>
  )
}

function RevokeForm(props: { hold: Hold; permit: HeldPermit; today: string }) {
  return (
    <details>
      <summary>Revoke</summary>
      <ActionForm
        action={revokeUnderHoldAction}
        submitLabel="Revoke permit"
        variant="destructive"
        confirm={{
          title: `Revoke permit ${props.permit.number}?`,
          body: 'The permit closes and releasing the hold does not bring it back.',
          confirmLabel: 'Revoke permit',
        }}
      >
        <PermitFields {...props} />
      </ActionForm>
    </details>
  )
}

function PermitItem(props: { hold: Hold; permit: HeldPermit; today: string; manage: boolean }) {
  const { permit, manage } = props
  const suspendedHere = permit.action === 'suspended'
  const status = suspendedHere
    ? 'suspended under this hold'
    : permit.state === 'suspended'
      ? 'suspended on appeal'
      : 'issued'
  return (
    <li className="record-item space-y-2">
      <p>
        <Link
          href={`/staff/applications/${permit.applicationId}`}
        >{`Permit ${permit.number}`}</Link>
        {`, ${status}.`}
      </p>
      {manage && permit.state === 'issued' ? <SuspendForm {...props} /> : null}
      {manage && (permit.state === 'issued' || suspendedHere) ? <RevokeForm {...props} /> : null}
    </li>
  )
}

function ActiveHold({ hold, detail, can }: { hold: Hold; detail: CaseDetail; can: Can }) {
  const permits = detail.remedies?.permits ?? []
  return (
    <>
      <p>
        {`Hold placed ${formatCivilDate(hold.placedOn)}. The town refuses new applications and permit issuance on this parcel until the hold is released.`}
      </p>
      {permits.length === 0 ? (
        <p>No issued permits on this parcel.</p>
      ) : (
        <ul className="list-none space-y-2 p-0">
          {permits.map((p) => (
            <PermitItem
              key={p.applicationId}
              hold={hold}
              permit={p}
              today={detail.today}
              manage={can.manage}
            />
          ))}
        </ul>
      )}
      {can.manage ? (
        <details>
          <summary>Release the hold</summary>
          <ActionForm
            action={releaseDevelopmentHoldAction}
            submitLabel="Release hold"
            variant="outline"
          >
            <Hidden name="holdId" value={hold.id} />
            <DateField label="Date the hold is released" name="releasedOn" today={detail.today} />
          </ActionForm>
        </details>
      ) : null}
    </>
  )
}

function HoldPart({ detail, can, offer }: { detail: CaseDetail; can: Can; offer: boolean }) {
  const holds = detail.remedies?.holds ?? []
  const active = holds.find((h) => h.releasedOn === null)
  return (
    <>
      <h3>Development hold</h3>
      {holds
        .filter((h) => h.releasedOn !== null)
        .map((h) => (
          <p key={h.id}>
            {`Hold placed ${formatCivilDate(h.placedOn)} and released ${formatCivilDate(h.releasedOn ?? '')}.`}
          </p>
        ))}
      {active === undefined ? null : <ActiveHold hold={active} detail={detail} can={can} />}
      {active === undefined && holds.length === 0 && !offer ? (
        <p>
          A hold can be placed once the cure period runs out with a noticed violation still open.
        </p>
      ) : null}
      {active === undefined && offer ? (
        <details>
          <summary>Place a development hold</summary>
          <PlaceHoldForm detail={detail} variant="outline" />
        </details>
      ) : null}
    </>
  )
}

function CivilPart({ detail, offer }: { detail: CaseDetail; offer: boolean }) {
  const filed = detail.remedies?.civilActions ?? []
  return (
    <>
      <h3>Civil actions</h3>
      {filed.length === 0 ? <p>No civil action is recorded.</p> : null}
      {filed.map((c) => (
        <p key={c.id}>
          {`Filed ${formatCivilDate(c.filedOn)} in ${c.court}${c.docket === null ? '' : `, docket ${c.docket}`}.`}
        </p>
      ))}
      {offer ? (
        <details>
          <summary>Record a civil action</summary>
          <CivilActionForm detail={detail} variant="outline" />
        </details>
      ) : null}
    </>
  )
}

export function RemedySection({
  detail,
  can,
  hosted,
}: {
  detail: CaseDetail
  can: Can
  hosted: ReadonlySet<string>
}) {
  const remedies = detail.remedies
  if (remedies === undefined || (!remedies.holdOffered && !remedies.civilOffered)) return null
  const lapsed = cureStanding(detail.findings, detail.cure.notices, detail.today).lapsedUncorrected
  const offer = can.manage && lapsed
  return (
    <>
      {remedies.holdOffered ? (
        <HoldPart detail={detail} can={can} offer={offer && !hosted.has('place_hold')} />
      ) : null}
      {remedies.civilOffered ? (
        <CivilPart detail={detail} offer={offer && !hosted.has('file_civil_action')} />
      ) : null}
    </>
  )
}
