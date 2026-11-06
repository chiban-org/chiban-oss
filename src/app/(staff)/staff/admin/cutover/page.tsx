import type { Metadata } from 'next'
import { ActionForm } from '@/components/ActionForm'
import { SettingsHeader } from '@/components/settings/SettingsHeader'
import { SelectField, TextField } from '@/components/staff/fields'
import { NoPermission } from '@/components/staff/NoPermission'
import { Button } from '@/components/ui/button'
import { hasCapability } from '@/features/authz/capabilities'
import { listRecentReconciliations } from '@/features/cutover/reconcile'
import { cutoverTemplateTypes } from '@/features/cutover/template'
import { townTimeZone } from '@/features/town/timeZone'
import { requireStaffContext } from '@/server/requireStaff'
import { importCutoverAction, reconcileCutoverAction } from './actions'
import { ReconciliationTable } from './ReconciliationTable'

export const metadata: Metadata = { title: 'Move open applications over' }

export const dynamic = 'force-dynamic'

export default async function CutoverPage() {
  const ctx = await requireStaffContext()
  if (!(await hasCapability(ctx.db, ctx.actor.userId, 'cutover.import', ctx.signal))) {
    return <NoPermission title="Move open applications over" action="import applications" />
  }
  const isAdmin = ctx.actor.roles.includes('admin')
  const [types, reconciliations, timeZone] = await Promise.all([
    cutoverTemplateTypes(ctx.db, ctx.signal),
    listRecentReconciliations(ctx.db, ctx.signal),
    townTimeZone(ctx.db, ctx.signal),
  ])
  return (
    <main>
      <SettingsHeader
        title="Move open applications over"
        lead="Bring applications still open in the old system into Chiban, then compare them with the town's own list."
      />
      <p>
        Imported applications keep their dates from the old system, and nobody on them is sent a
        message. Each keeps the status it had there, without the checks Chiban runs before a status
        change. Fees paid in the old system are recorded as waived, with the old receipt number.
      </p>
      <section aria-labelledby="cutover-template">
        <h2 id="cutover-template">Template</h2>
        <form method="get" action="/staff/admin/cutover/template.csv" className="space-y-2">
          <SelectField
            id="cutover-template-type"
            label="Application type"
            name="type"
            defaultValue=""
            hint="The template lists the form fields of the type you pick, or of every adopted type."
            options={[
              ['', 'Every adopted application type'],
              ...types.map((t) => [t.key, t.label] as const),
            ]}
          />
          <Button type="submit" variant="outline">
            Download the CSV template
          </Button>
        </form>
        <p>
          In the <code>fees_paid_in_prior_system</code> column, write yes if the fees were paid in
          the old system, no if they were not, or leave it empty. An amount such as 45.00 is not
          accepted.
        </p>
      </section>
      <section aria-labelledby="cutover-import">
        <h2 id="cutover-import">Import</h2>
        <p>Check the file first. Checking saves nothing and lists any rows that would fail.</p>
        <ActionForm
          action={importCutoverAction}
          submitLabel="Check the file"
          alternate={{ label: 'Import the file', name: 'mode', value: 'import' }}
        >
          <TextField
            id="cutover-file"
            label="CSV file"
            type="file"
            name="file"
            accept=".csv,text/csv"
            required
          />
        </ActionForm>
        <p>
          To attach scanned files, whoever runs the server runs the folder attach command, with one
          folder per legacy number.
        </p>
      </section>
      <section aria-labelledby="cutover-compare">
        <h2 id="cutover-compare">Compare with the town&apos;s list</h2>
        <ActionForm action={reconcileCutoverAction} submitLabel="Compare with the list">
          <TextField
            id="cutover-list"
            label="Town list as a CSV file with a legacy_number column"
            type="file"
            name="file"
            accept=".csv,text/csv"
            required
          />
        </ActionForm>
        <ReconciliationTable rows={reconciliations} isAdmin={isAdmin} timeZone={timeZone} />
      </section>
    </main>
  )
}
