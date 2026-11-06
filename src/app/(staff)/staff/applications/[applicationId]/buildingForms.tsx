import { ActionForm } from '@/components/ActionForm'
import { SelectField, TextField } from '@/components/staff/fields'
import type { StaffApplicationView } from '@/features/applications/staffApplicationView'
import { TERMINAL_STATES } from '@/features/applications/states'
import { DETERMINATION_OPTIONS } from '@/features/building/labels'
import { REGIONAL_IMPACT_OPEN_STATES } from '@/features/building/regionalImpactStates'
import { loadPack } from '@/features/packs/loadPack'
import { humanizeIsoDates } from '@/lib/formatDate'
import { recordCodeEditionAction } from './actions'
import { regionalImpactAction } from './buildingActions'

const ELECTION_NONE: [string, string] = ['', 'No election: use the edition in force']

function electionOptions(): [string, string][] {
  return loadPack()
    .codeEditions.filter((e) => e.status === 'verified')
    .map((e): [string, string] => [e.key, humanizeIsoDates(e.label)])
}

type Variant = 'default' | 'outline'

export function CodeEditionForm({
  view,
  variant = 'outline',
}: {
  view: StaffApplicationView
  variant?: Variant
}) {
  return (
    <ActionForm
      action={recordCodeEditionAction}
      submitLabel={view.codeEdition === null ? 'Record code edition' : 'Record again'}
      variant={variant}
    >
      <input type="hidden" name="applicationId" value={view.id} />
      <SelectField
        label="Applicant election, only inside the overlap period"
        name="election"
        options={[ELECTION_NONE, ...electionOptions()]}
      />
    </ActionForm>
  )
}

export function RegionalDeterminationForm({
  view,
  variant = 'outline',
}: {
  view: StaffApplicationView
  variant?: Variant
}) {
  return (
    <ActionForm action={regionalImpactAction} submitLabel="Record determination" variant={variant}>
      <input type="hidden" name="applicationId" value={view.id} />
      <SelectField label="Determination" name="determination" options={DETERMINATION_OPTIONS} />
      <TextField label="Board reference (if previously determined)" name="previousBoardRef" />
      <TextField
        label="Determined on"
        name="determinedOn"
        type="date"
        defaultValue={view.today}
        required
      />
    </ActionForm>
  )
}

export function codeEditionEditable(view: StaffApplicationView): boolean {
  return (
    view.classification === 'nh.building_permit' &&
    view.state !== 'draft' &&
    !TERMINAL_STATES.includes(view.state) &&
    view.permissions.canIssue
  )
}

export function regionalImpactEditable(view: StaffApplicationView): boolean {
  return (
    view.regionalImpact.applies &&
    view.permissions.canDetermineRegionalImpact &&
    REGIONAL_IMPACT_OPEN_STATES.includes(view.state)
  )
}
