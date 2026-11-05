import Link from 'next/link'
import { ActionForm } from '@/components/ActionForm'
import { ConfigEditorForm } from '@/components/config/ConfigEditorForm'
import { GraphStubNotice } from '@/components/inspections/GraphStubNotice'
import { SettingsHeader } from '@/components/settings/SettingsHeader'
import { SelectField, TextField } from '@/components/staff/fields'
import { hasCapability } from '@/features/authz/capabilities'
import { discardOffer } from '@/features/config/discardOffer'
import { editorContext } from '@/features/config/editorContext'
import { getEditorState } from '@/features/config/settingsViews'
import { connectedTenant, loadInspectorTargets } from '@/features/inspections/settingsView'
import { requireStaffContext } from '@/server/requireStaff'
import {
  publishInspectionSettingsAction,
  saveCalendarAccountAction,
  saveInspectorCalendarAction,
} from '../../inspections/actions'
import { discardDraftAction, saveDraftAction } from '../actions'

export const dynamic = 'force-dynamic'

export default async function InspectionSettingsPage() {
  const ctx = await requireStaffContext()
  const canEdit = await hasCapability(ctx.db, ctx.actor.userId, 'config.edit', ctx.signal)
  const canSchedule = await hasCapability(
    ctx.db,
    ctx.actor.userId,
    'inspection.schedule',
    ctx.signal,
  )
  const state = await getEditorState(ctx.db, 'inspection_settings', 'default', ctx.signal)
  const targets = await loadInspectorTargets(ctx.db, ctx.signal)
  const tenant = await connectedTenant(ctx.db, ctx.signal)
  return (
    <main>
      <SettingsHeader
        title="Inspection schedule"
        lead="When inspections can be booked, and where each inspector's calendar invites go."
      />
      <p>
        {canSchedule ? (
          <Link href="/staff/inspections">Open the schedule board</Link>
        ) : (
          'Inspections are booked on the schedule board, and only staff who can schedule inspections can open it.'
        )}
      </p>
      {canEdit ? (
        <ConfigEditorForm
          kind="inspection_settings"
          configKey="default"
          initialBody={state.body}
          resetKey={state.versions.map((v) => `${v.id}:${v.status}`).join(',')}
          context={editorContext()}
          saveAction={saveDraftAction}
          publishAction={publishInspectionSettingsAction}
          {...discardOffer(state.versions, discardDraftAction)}
        />
      ) : (
        <p role="alert">You do not have permission to change inspection settings.</p>
      )}
      <section aria-label="Inspector calendars">
        <h2>Inspector calendars</h2>
        <p>
          Every booking is sent to the inspector as a calendar invite. Chiban is the record. The
          calendar only holds a copy.
        </p>
        <GraphStubNotice />
        {targets.length === 0 ? <p>No inspectors have been added yet.</p> : null}
        {targets.map((t) => (
          <div key={t.userId} className="max-w-xl rounded-md border p-3">
            <h3>{t.name}</h3>
            <p>{`Account email: ${t.accountEmail}`}</p>
            {canEdit ? (
              <ActionForm action={saveInspectorCalendarAction} submitLabel="Save calendar target">
                <input type="hidden" name="userId" value={t.userId} />
                <SelectField
                  label="Send invites by"
                  name="kind"
                  defaultValue={t.kind}
                  options={[
                    ['ics_email', 'Email with a calendar invite'],
                    ['graph', 'Microsoft calendar (practice connection)'],
                  ]}
                />
                <TextField
                  label="Email address"
                  name="email"
                  type="email"
                  defaultValue={t.email}
                  required
                />
                <TextField
                  label="Microsoft 365 user"
                  name="graphUserId"
                  defaultValue={t.graphUserId}
                  hint="Only for Microsoft calendar. Your IT contact can give you this."
                />
              </ActionForm>
            ) : (
              <p>{t.kind === 'graph' ? 'Microsoft calendar' : `Email invite to ${t.email}`}</p>
            )}
          </div>
        ))}
      </section>
      <section aria-label="Microsoft 365 connection" className="max-w-xl">
        <h2>Microsoft 365 connection</h2>
        <p>
          Only needed if inspectors keep their calendars in Microsoft 365. Your IT contact can find
          these values in the Microsoft admin center.
        </p>
        <p role="status">
          {tenant === null
            ? 'Not connected. Invites go out by email.'
            : `Connection details are saved for ${tenant.tenantId}. They have not been checked against a live Microsoft 365 account yet.`}
        </p>
        {canEdit ? (
          <details>
            <summary>Enter the connection details</summary>
            <ActionForm action={saveCalendarAccountAction} submitLabel="Save connection details">
              <TextField label="Directory (tenant) ID" name="tenantId" required />
              <TextField label="Application (client) ID" name="clientId" required />
              <TextField label="Client secret" name="clientSecret" type="password" required />
            </ActionForm>
          </details>
        ) : null}
      </section>
    </main>
  )
}
