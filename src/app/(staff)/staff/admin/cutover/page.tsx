import { ActionForm } from '@/components/ActionForm'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { hasCapability } from '@/features/authz/capabilities'
import { listRecentReconciliations } from '@/features/cutover/reconcile'
import { cutoverTemplateTypes } from '@/features/cutover/template'
import { townTimeZone } from '@/features/town/timeZone'
import { requireStaffContext } from '@/server/requireStaff'
import { importCutoverAction, reconcileCutoverAction } from './actions'
import { ReconciliationTable } from './ReconciliationTable'

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
  const [types, reconciliations, timeZone] = await Promise.all([
    cutoverTemplateTypes(ctx.db, ctx.signal),
    listRecentReconciliations(ctx.db, ctx.signal),
    townTimeZone(ctx.db, ctx.signal),
  ])
  return (
    <main>
      <h1>Move open applications over</h1>
      <p>
        Bring applications that are still open in the old system into Chiban, then compare them with
        the town&apos;s own list. Imported applications keep their dates from the old system, and
        nobody on them is sent a message. Each keeps the status it had there, without the checks
        Chiban runs before a status change. Fees paid in the old system are recorded as waived, with
        the old receipt number.
      </p>
      <form method="get" action="/staff/admin/cutover/template.csv" className="my-3 space-y-2">
        <Label htmlFor="cutover-template-type">Application type</Label>
        <NativeSelect
          id="cutover-template-type"
          name="type"
          defaultValue=""
          wrapperClassName="max-w-md"
        >
          <NativeSelectOption value="">Every adopted application type</NativeSelectOption>
          {types.map((t) => (
            <NativeSelectOption key={t.key} value={t.key}>
              {t.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <p className="m-0">
          The template lists the form fields of the type you pick, or of every adopted type.
        </p>
        <Button type="submit" variant="outline">
          Download the CSV template
        </Button>
      </form>
      <p>
        In the <code>fees_paid_in_prior_system</code> column, write yes if the fees were paid in the
        old system, no if they were not, or leave it empty. An amount such as 45.00 is not accepted.
      </p>
      <h2>Import</h2>
      <p>Check the file first. Checking saves nothing and lists any rows that would fail.</p>
      <ActionForm
        action={importCutoverAction}
        submitLabel="Check the file"
        alternate={{ label: 'Import the file', name: 'mode', value: 'import' }}
      >
        <Label htmlFor="cutover-file">CSV file</Label>
        <Input id="cutover-file" type="file" name="file" accept=".csv,text/csv" required />
      </ActionForm>
      <p>
        To attach scanned files, whoever runs the server runs the folder attach command, with one
        folder per legacy number.
      </p>
      <h2>Compare with the town&apos;s list</h2>
      <ActionForm action={reconcileCutoverAction} submitLabel="Compare with the list">
        <Label htmlFor="cutover-list">Town list as a CSV file with a legacy_number column</Label>
        <Input id="cutover-list" type="file" name="file" accept=".csv,text/csv" required />
      </ActionForm>
      <ReconciliationTable rows={reconciliations} isAdmin={isAdmin} timeZone={timeZone} />
    </main>
  )
}
