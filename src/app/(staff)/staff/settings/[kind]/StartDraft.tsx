import { ActionForm } from '@/components/ActionForm'
import { NewItemDialog } from '@/components/settings/NewItemDialog'
import { SelectField, TextField } from '@/components/staff/fields'
import { KIND_DESCRIPTIONS, KIND_NEW_LABELS } from '@/features/config/kindLabels'
import type { ConfigKind } from '@/features/config/kinds'
import { loadPack } from '@/features/packs/loadPack'
import { startDraftAction } from '../actions'

function KeyField({ kind }: { kind: ConfigKind }) {
  if (kind === 'town_rule_setting') {
    const townRules = loadPack().rules.filter((r) => r.kind === 'town_setting')
    return (
      <SelectField
        label="Rule"
        name="key"
        options={townRules.map((r): [string, string] => [r.key, r.label])}
      />
    )
  }
  return (
    <TextField
      label="Key"
      name="key"
      required
      hint="Letters, numbers, hyphens, underscores, and dots. Other items refer to it by this key."
    />
  )
}

export function NewConfigItem({ kind }: { kind: ConfigKind }) {
  return (
    <NewItemDialog label={KIND_NEW_LABELS[kind]} description={KIND_DESCRIPTIONS[kind]}>
      <ActionForm action={startDraftAction} submitLabel="Start a draft" variant="default">
        <input type="hidden" name="kind" value={kind} />
        <KeyField kind={kind} />
      </ActionForm>
    </NewItemDialog>
  )
}
