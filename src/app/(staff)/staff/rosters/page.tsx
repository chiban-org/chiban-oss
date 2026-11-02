import { ActionForm } from '@/components/ActionForm'
import { AreaField, SelectField, TextField } from '@/components/staff/fields'
import { NoPermission } from '@/components/staff/NoPermission'
import { loadRostersView } from '@/features/rosters/rosterView'
import { requireStaffContext } from '@/server/requireStaff'
import {
  addRestrictionAction,
  endRestrictionAction,
  recordReviewAction,
  upsertAssociationAction,
  upsertParkAction,
} from './actions'

export const dynamic = 'force-dynamic'

export default async function RostersPage() {
  const ctx = await requireStaffContext()
  const view = await loadRostersView(ctx.db, ctx.actor, ctx.signal)
  if (view === null) return <NoPermission title="Rosters" action="keep the abutter rosters" />
  return (
    <main className="space-y-8">
      <h1>Rosters</h1>
      <p className="max-w-prose text-muted-foreground">
        These lists are kept by the town and feed every abutter list. Review each one on a schedule
        so the lists drawn from them can be trusted.
      </p>
      <section aria-label="Review status" className="space-y-3">
        <h2>When each roster was last reviewed</h2>
        {view.kinds.map((k) => (
          <div key={k.kind} className="flex flex-wrap items-end gap-4 border-b pb-3">
            <div className="min-w-72 flex-1">
              <p className="m-0 font-medium">{k.label}</p>
              <p className="m-0">{k.statusText}</p>
            </div>
            <ActionForm action={recordReviewAction} submitLabel="Record a review today">
              <input type="hidden" name="kind" value={k.kind} />
              <input type="hidden" name="reviewedOn" value={view.today} />
            </ActionForm>
          </div>
        ))}
      </section>
      <section aria-label="Condominium associations" className="space-y-3">
        <h2>Condominium associations</h2>
        {view.associations.length === 0 ? <p>No association rosters yet.</p> : null}
        {view.associations.map((a) => (
          <div key={a.parcel}>
            <p className="m-0 font-medium">{`${a.name}, parcel ${a.parcel}`}</p>
            <p className="m-0">{`Current as of ${a.asOfText}: ${a.officers.join('; ')}`}</p>
          </div>
        ))}
        <details>
          <summary>Add or replace an association roster</summary>
          <ActionForm
            action={upsertAssociationAction}
            submitLabel="Save roster"
            className="max-w-xl"
          >
            <TextField label="Parcel ID of the condominium" name="parcelRef" required />
            <TextField label="Association name" name="associationName" required />
            <TextField
              label="Roster current as of"
              name="asOf"
              type="date"
              defaultValue={view.today}
              required
            />
            <AreaField
              label="Officers, one per line"
              name="officers"
              hint="Write each line as: Name | Title | Mailing address"
              rows={4}
              required
            />
          </ActionForm>
        </details>
      </section>
      <section aria-label="Manufactured housing parks" className="space-y-3">
        <h2>Manufactured housing parks</h2>
        {view.parks.length === 0 ? <p>No park rosters yet.</p> : null}
        {view.parks.map((p) => (
          <div key={p.parcel}>
            <p className="m-0 font-medium">{`${p.name}, parcel ${p.parcel}, owned by ${p.owner}`}</p>
            <p className="m-0">{`Current as of ${p.asOfText}. Tenants: ${p.tenants.join('; ')}`}</p>
          </div>
        ))}
        <details>
          <summary>Add or replace a park roster</summary>
          <ActionForm action={upsertParkAction} submitLabel="Save roster" className="max-w-xl">
            <TextField label="Parcel ID of the park" name="parcelRef" required />
            <TextField label="Park name" name="parkName" required />
            <TextField label="Owner name" name="ownerName" required />
            <TextField label="Owner mailing address" name="ownerMailingAddress" required />
            <TextField
              label="Roster current as of"
              name="asOf"
              type="date"
              defaultValue={view.today}
              required
            />
            <AreaField
              label="Tenants, one per line"
              name="tenants"
              hint="Write each line as: Name | Site | Mailing address"
              rows={4}
              required
            />
          </ActionForm>
        </details>
      </section>
      <section aria-label="Easement and restriction holders" className="space-y-3">
        <h2>Easement and restriction holders</h2>
        {view.restrictions.length === 0 ? <p>No holders yet.</p> : null}
        {view.restrictions.map((r) => (
          <div key={r.id} className="flex flex-wrap items-end gap-4 border-b pb-3">
            <p className="m-0 min-w-72 flex-1">
              {`${r.holder}: ${r.kindText} on parcel ${r.parcel}, recorded at ${r.reference}.`}
              {r.endedText === null ? '' : ` Ended ${r.endedText}.`}
            </p>
            {r.endedText === null ? (
              <ActionForm action={endRestrictionAction} submitLabel="Mark as ended today">
                <input type="hidden" name="holdingId" value={r.id} />
                <input type="hidden" name="endedOn" value={view.today} />
              </ActionForm>
            ) : null}
          </div>
        ))}
        <details>
          <summary>Add a holder</summary>
          <ActionForm action={addRestrictionAction} submitLabel="Add holder" className="max-w-xl">
            <TextField label="Parcel ID the restriction covers" name="parcelRef" required />
            <TextField label="Holder name" name="holderName" required />
            <TextField label="Holder mailing address" name="holderMailingAddress" required />
            <SelectField
              label="Kind"
              name="restrictionKind"
              options={[
                ['conservation', 'Conservation easement'],
                ['preservation', 'Preservation easement'],
                ['agricultural_preservation', 'Agricultural preservation restriction'],
              ]}
            />
            <TextField label="Where it is recorded" name="recordedReference" required />
          </ActionForm>
        </details>
      </section>
    </main>
  )
}
