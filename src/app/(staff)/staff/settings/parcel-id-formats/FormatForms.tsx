'use client'

import { useState } from 'react'
import { ActionForm } from '@/components/ActionForm'
import { FormDialog, RowEditDialog } from '@/components/FormDialog'
import { SelectField, TextField } from '@/components/staff/fields'
import {
  addFormatAction,
  deleteFormatAction,
  displayFormatAction,
  editFormatAction,
} from './actions'

const KIND_OPTIONS = [
  ['digits', 'Digits only'],
  ['free_text', 'Any text'],
] as const

interface FormatValues {
  label: string
  kind: 'digits' | 'free_text'
  width: number | null
}

function ShapeFields({ values }: { values?: FormatValues }) {
  const [kind, setKind] = useState(values?.kind ?? 'digits')
  return (
    <>
      <TextField
        label="Name"
        name="label"
        required
        maxLength={60}
        defaultValue={values?.label ?? ''}
        hint="What staff call this ID, for example Map-lot ID."
      />
      <SelectField
        label="Characters allowed"
        name="kind"
        options={KIND_OPTIONS}
        value={kind}
        onChange={(e) => setKind(e.target.value as FormatValues['kind'])}
      />
      {kind === 'digits' ? (
        <TextField
          label="Number of digits"
          name="width"
          inputMode="numeric"
          defaultValue={values?.width === null || values === undefined ? '' : String(values.width)}
          hint="Leave blank to accept any number of digits. Leading zeros count."
        />
      ) : null}
    </>
  )
}

export function AddFormat() {
  return (
    <FormDialog
      label="Add a format"
      title="Add a parcel ID format"
      description="Imports and parcel pages can link parcels using any format on this list."
      variant="default"
    >
      <ActionForm action={addFormatAction} submitLabel="Add format" closeOnSuccess>
        <TextField
          label="Short name"
          name="key"
          required
          maxLength={32}
          hint="Lowercase letters, digits and underscores, for example cama15. It cannot be changed later."
        />
        <ShapeFields />
      </ActionForm>
    </FormDialog>
  )
}

export function EditFormat({ formatKey, values }: { formatKey: string; values: FormatValues }) {
  return (
    <RowEditDialog record={values.label} title={`Edit ${values.label}`}>
      <ActionForm action={editFormatAction} submitLabel="Save changes" closeOnSuccess>
        <input type="hidden" name="key" value={formatKey} />
        <ShapeFields values={values} />
      </ActionForm>
    </RowEditDialog>
  )
}

export function ShowFormat({ formatKey, label }: { formatKey: string; label: string }) {
  return (
    <ActionForm
      action={displayFormatAction}
      submitLabel="Show this ID"
      submitAccessibleLabel={`Show ${label} on parcels`}
      variant="outline"
      compact
    >
      <input type="hidden" name="key" value={formatKey} />
    </ActionForm>
  )
}

export function DeleteFormat({ formatKey, label }: { formatKey: string; label: string }) {
  return (
    <ActionForm
      action={deleteFormatAction}
      submitLabel="Delete"
      submitAccessibleLabel={`Delete ${label}`}
      variant="outline"
      confirm={{
        title: `Delete ${label}?`,
        body: 'No parcel IDs use it yet. You can add it again later.',
        confirmLabel: 'Delete format',
      }}
      compact
    >
      <input type="hidden" name="key" value={formatKey} />
    </ActionForm>
  )
}
