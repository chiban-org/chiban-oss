import { ActionForm } from '@/components/ActionForm'
import { SelectField, TextField } from '@/components/staff/fields'
import type { DeliveryGroupView } from '@/features/decisions/deliveryView'
import { recordDeliveryAction } from '../../hearings/decisionActions'

function RecordForm({
  row,
  group,
  today,
}: {
  row: DeliveryGroupView['rows'][number]
  group: DeliveryGroupView
  today: string
}) {
  return (
    <ActionForm
      action={recordDeliveryAction}
      submitLabel={`Record delivery to ${row.name}`}
      variant="default"
      className="max-w-md"
    >
      <input type="hidden" name="deliveryId" value={row.id} />
      <SelectField
        label="How it was delivered"
        name="method"
        options={group.methods.map((m): [string, string] => [m.value, m.label])}
      />
      <TextField
        label="Date delivered"
        name="deliveredOn"
        type="date"
        defaultValue={today}
        max={today}
        required
      />
    </ActionForm>
  )
}

function GroupBlock({ group, today }: { group: DeliveryGroupView; today: string }) {
  return (
    <div>
      <h3>{group.title}</h3>
      {group.dueText === null ? null : <p>{`Due ${group.dueText}.`}</p>}
      <ul className="m-0 grid list-none gap-4 p-0">
        {group.rows.map((row) => (
          <li key={row.id}>
            <p className="m-0 font-medium">{`${row.roleLabel}: ${row.name}`}</p>
            {row.delivered === null ? (
              <RecordForm row={row} group={group} today={today} />
            ) : (
              <p className="m-0">{row.delivered}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function DeliverySection({ groups, today }: { groups: DeliveryGroupView[]; today: string }) {
  return (
    <section aria-labelledby="delivery">
      <h2 id="delivery">Delivery</h2>
      {groups.map((group) => (
        <GroupBlock key={group.key} group={group} today={today} />
      ))}
    </section>
  )
}
