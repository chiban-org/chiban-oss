import Link from 'next/link'
import { ActionForm } from '@/components/ActionForm'
import { ConfigEditorForm } from '@/components/config/ConfigEditorForm'
import { GraphStubNotice } from '@/components/inspections/GraphStubNotice'
import { SelectField, TextField } from '@/components/staff/fields'
import { hasCapability } from '@/features/authz/capabilities'
import { editorContext } from '@/features/config/editorContext'
import { getEditorState } from '@/features/config/settingsViews'
import { connectedTenant, loadInspectorTargets } from '@/features/inspections/settingsView'
import { requireStaffContext } from '@/server/requireStaff'
import {
  publishInspectionSettingsAction,
  saveCalendarAccountAction,
  saveInspectorCalendarAction,
} from '../../inspections/actions'
import { saveDraftAction } from '../actions'

export const dynamic = 'force-dynamic'

export default async function InspectionSettingsPage() {
  const ctx = await requireStaffContext()
  const canEdit = await hasCapability(ctx.db, ctx.actor.userId, 'config.edit', ctx.signal)
  const state = await getEditorState(ctx.db, 'inspection_settings', 'default', ctx.signal)
  const targets = await loadInspectorTargets(ctx.db, ctx.signal)
  const tenant = await connectedTenant(ctx.db, ctx.signal)
  return (
    <main className="space-y-6">
      <h1>Inspection settings</h1>
      <p>
        <Link href="/staff/inspections" className="text-action underline">
          Back to the schedule board
        </Link>
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
        />
      ) : (
        <p role="alert">You do not have permission to change inspection settings.</p>
      )}
      <section aria-label="Inspector calendars" className="space-y-3">
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
                  label="Microsoft user (only for Microsoft calendar)"
                  name="graphUserId"
                  defaultValue={t.graphUserId}
                />
              </ActionForm>
            ) : (
              <p>{t.kind === 'graph' ? 'Microsoft calendar' : `Email invite to ${t.email}`}</p>
            )}
          </div>
        ))}
      </section>
      <section aria-label="Microsoft tenant" className="max-w-xl space-y-3">
        <h2>Microsoft tenant</h2>
        <p role="status">
          {tenant === null
            ? 'No Microsoft tenant is connected.'
            : `Tenant ${tenant.tenantId} is saved. It has not been verified against a live Microsoft 365 account.`}
        </p>
        {canEdit ? (
          <ActionForm action={saveCalendarAccountAction} submitLabel="Save tenant details">
            <TextField label="Tenant ID" name="tenantId" required />
            <TextField label="Application (client) ID" name="clientId" required />
            <TextField label="Client secret" name="clientSecret" type="password" required />
          </ActionForm>
        ) : null}
      </section>
    </main>
  )
}
