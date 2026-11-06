import { ActionForm } from '@/components/ActionForm'
import { FactList } from '@/components/layout/PageHeader'
import { SelectField } from '@/components/staff/fields'
import type { StaffChoice } from '@/features/applications/responsibleStaff'
import { setResponsibleStaffAction } from './responsibleActions'

export interface ResponsibleData {
  current: { userId: string; name: string } | null
  choices: StaffChoice[]
  canManage: boolean
}

function ChangeResponsible({
  applicationId,
  data,
}: {
  applicationId: string
  data: ResponsibleData
}) {
  const options: [string, string][] = [
    ['', 'Nobody'],
    ...data.choices.map((c): [string, string] => [c.id, c.name]),
  ]
  return (
    <details>
      <summary>
        {data.current === null ? 'Assign a responsible staff member' : 'Change who is responsible'}
      </summary>
      <ActionForm action={setResponsibleStaffAction} submitLabel="Save">
        <input type="hidden" name="applicationId" value={applicationId} />
        <SelectField
          label="Responsible staff member"
          name="userId"
          options={options}
          defaultValue={data.current?.userId ?? ''}
        />
      </ActionForm>
    </details>
  )
}

export function ResponsibleStaff({
  applicationId,
  data,
}: {
  applicationId: string
  data: ResponsibleData
}) {
  const name =
    data.current === null ? (
      <span className="text-muted-foreground">Nobody yet</span>
    ) : (
      data.current.name
    )
  return (
    <div className="space-y-3">
      <FactList facts={[{ label: 'Responsible', value: name }]} stacked />
      {data.canManage ? <ChangeResponsible applicationId={applicationId} data={data} /> : null}
    </div>
  )
}
