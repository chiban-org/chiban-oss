import { ActionForm } from '@/components/ActionForm'
import { FactList } from '@/components/layout/PageHeader'
import { SelectField } from '@/components/staff/fields'
import { reassignCaseAction } from '../assignActions'

export interface CaseAssigneeData {
  current: { userId: string; name: string } | null
  choices: { id: string; name: string }[]
}

export function CaseAssignee({
  caseId,
  data,
  canManage,
}: {
  caseId: string
  data: CaseAssigneeData
  canManage: boolean
}) {
  const name =
    data.current === null ? (
      <span className="text-muted-foreground">Unassigned</span>
    ) : (
      data.current.name
    )
  const options: [string, string][] = [
    ['', 'Nobody'],
    ...data.choices.map((c): [string, string] => [c.id, c.name]),
  ]
  return (
    <section aria-label="Assignment" data-plain className="rail-card space-y-3">
      <FactList facts={[{ label: 'Assigned to', value: name }]} stacked />
      {canManage ? (
        <details>
          <summary>Reassign the case</summary>
          <ActionForm action={reassignCaseAction} submitLabel="Reassign">
            <input type="hidden" name="caseId" value={caseId} />
            <SelectField
              label="Assign to"
              name="userId"
              options={options}
              defaultValue={data.current?.userId ?? ''}
            />
          </ActionForm>
        </details>
      ) : null}
    </section>
  )
}
