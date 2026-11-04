import Link from 'next/link'
import { ActionForm } from '@/components/ActionForm'
import { NewItemDialog } from '@/components/settings/NewItemDialog'
import { SelectField, TextField } from '@/components/staff/fields'
import { KIND_DESCRIPTIONS, KIND_NEW_LABELS } from '@/features/config/kindLabels'
import type { ConfigKind } from '@/features/config/kinds'
import { loadPack } from '@/features/packs/loadPack'
import { startDraftAction } from '../actions'

const SETTABLE = new Set(['minimum', 'maximum', 'delegated_choice'])

function NameFields({ kind }: { kind: ConfigKind }) {
  if (kind === 'town_rule_setting') {
    const townRules = loadPack().rules.filter(
      (r) => r.kind === 'town_setting' && SETTABLE.has(r.overridePolicy.policy),
    )
    return (
      <SelectField
        label="Rule"
        name="key"
        hint="Only rules state law lets the town set are listed."
        options={townRules.map((r): [string, string] => [r.key, r.label])}
      />
    )
  }
  return (
    <>
      <TextField
        label="Name"
        name="label"
        required
        hint="The name staff see in lists and pickers. You can change it later."
      />
      <details className="rounded-md border border-hairline p-3">
        <summary className="cursor-pointer text-sm font-medium">Advanced</summary>
        <div className="mt-3">
          <TextField
            label="Short name"
            name="key"
            hint="Made from the name when left empty. Other settings refer to this item by it, and it cannot be changed later."
          />
        </div>
      </details>
    </>
  )
}

export function NewConfigItem({ kind }: { kind: ConfigKind }) {
  return (
    <NewItemDialog label={KIND_NEW_LABELS[kind]} description={KIND_DESCRIPTIONS[kind]}>
      {kind === 'application_type' ? (
        <p className="m-0 text-sm">
          Most towns start from a <Link href="/staff/settings/starters">starter template</Link>,
          which sets up the form, fees, conditions, checklists and permit together.
        </p>
      ) : null}
      <ActionForm action={startDraftAction} submitLabel="Start a draft" variant="default">
        <input type="hidden" name="kind" value={kind} />
        <NameFields kind={kind} />
      </ActionForm>
    </NewItemDialog>
  )
}
