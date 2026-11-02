import { ActionForm } from '@/components/ActionForm'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { hasCapability } from '@/features/authz/capabilities'
import { requireStaffContext } from '@/server/requireStaff'
import { importCutoverAction, reconcileCutoverAction, signOffReconciliationAction } from './actions'

export const dynamic = 'force-dynamic'

export default async function CutoverPage() {
  const ctx = await requireStaffContext()
  if (!(await hasCapability(ctx.db, ctx.actor.userId, 'cutover.import', ctx.signal))) {
    return (
      <main>
        <h1>Move open applications over</h1>
        <p role="alert">You do not have permission to import applications.</p>
      </main>
    )
  }
  const isAdmin = ctx.actor.roles.includes('admin')
  return (
    <main>
      <h1>Move open applications over</h1>
      <p>
        Bring applications that are still open in the prior system into Chiban, then check the list
        against the town&apos;s own list. Imported applications keep the dates from the prior
        system, and no message is sent to anyone on them. Gates are not evaluated for status carried
        over from the prior system, and fees paid there are recorded as waived with the old receipt
        number.
      </p>
      <p>
        <a className="text-action underline" href="/staff/admin/cutover/template.csv">
          Download the CSV template
        </a>{' '}
        or add <code>?type=KEY</code> for an application type to include only its form fields. The
        template lists the form fields of every adopted application type.
      </p>
      <p>
        In <code>fees_paid_in_prior_system</code>, write <code>yes</code>, <code>y</code> or{' '}
        <code>true</code> if the fees were paid, <code>no</code>, <code>n</code> or{' '}
        <code>false</code> if not, or leave it empty. An amount such as 45.00 is not accepted.
      </p>
      <h2>Import</h2>
      <ActionForm action={importCutoverAction} submitLabel="Check the file (dry run)">
        <input type="hidden" name="mode" value="dry_run" />
        <Label htmlFor="cutover-dry-file">CSV file</Label>
        <Input id="cutover-dry-file" type="file" name="file" accept=".csv,text/csv" required />
      </ActionForm>
      <ActionForm action={importCutoverAction} submitLabel="Import the file" variant="default">
        <input type="hidden" name="mode" value="import" />
        <Label htmlFor="cutover-file">CSV file</Label>
        <Input id="cutover-file" type="file" name="file" accept=".csv,text/csv" required />
      </ActionForm>
      <p>
        To attach scanned files, an operator runs the folder attach command with one folder per
        legacy number.
      </p>
      <h2>Reconcile with the town&apos;s list</h2>
      <ActionForm action={reconcileCutoverAction} submitLabel="Compare with the list">
        <Label htmlFor="cutover-list">List CSV with a legacy_number column</Label>
        <Input id="cutover-list" type="file" name="file" accept=".csv,text/csv" required />
      </ActionForm>
      {isAdmin ? (
        <ActionForm action={signOffReconciliationAction} submitLabel="Sign off">
          <Label htmlFor="cutover-reconciliation">Reconciliation number</Label>
          <Input id="cutover-reconciliation" name="reconciliationId" required />
        </ActionForm>
      ) : null}
    </main>
  )
}
