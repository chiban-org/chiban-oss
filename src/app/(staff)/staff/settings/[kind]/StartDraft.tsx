import { ActionForm } from '@/components/ActionForm'
import { SelectField, TextField } from '@/components/staff/fields'
import type { ConfigKind } from '@/features/config/kinds'
import { loadPack } from '@/features/packs/loadPack'
import { startDraftAction } from '../actions'

const SINGLETON_KINDS: readonly string[] = [
  'payment_settings',
  'inspection_settings',
  'board_settings',
  'regional_contacts',
  'review_routes',
]

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
  if (SINGLETON_KINDS.includes(kind)) return <input type="hidden" name="key" value="default" />
  return (
    <TextField
      label="Key"
      name="key"
      required
      hint="Letters, numbers, hyphens, underscores, and dots. Other items refer to it by this key."
    />
  )
}

export function StartDraft({ kind }: { kind: ConfigKind }) {
  return (
    <>
      <h2>Start a new one</h2>
      <ActionForm action={startDraftAction} submitLabel="Start a draft" className="max-w-md">
        <input type="hidden" name="kind" value={kind} />
        <KeyField kind={kind} />
      </ActionForm>
    </>
  )
}
