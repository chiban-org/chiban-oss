'use client'

import { ActionForm } from '@/components/ActionForm'
import { FormDialog, RowEditDialog } from '@/components/FormDialog'
import { SelectField, TextField } from '@/components/staff/fields'
import type { TownSectionKind } from '@/db/schema/townSections'
import { addSectionAction, editSectionAction, retireSectionAction } from './actions'

export const SECTION_KIND_OPTIONS: readonly (readonly [TownSectionKind, string])[] = [
  ['zoning_ordinance', 'Zoning ordinance'],
  ['building_code', 'Building code'],
  ['other_local_ordinance', 'Other local ordinance'],
]

interface SectionValues {
  provisionKind: TownSectionKind
  reference: string
  title: string
}

function SectionFields({ values }: { values?: SectionValues }) {
  return (
    <>
      <SelectField
        label="Kind of rule"
        name="provisionKind"
        options={SECTION_KIND_OPTIONS}
        defaultValue={values?.provisionKind ?? 'zoning_ordinance'}
      />
      <TextField
        label="Section"
        name="reference"
        required
        maxLength={200}
        defaultValue={values?.reference ?? ''}
        hint="As it should read in a finding, for example Zoning Ordinance Section 4.2."
      />
      <TextField
        label="Short title"
        name="title"
        maxLength={200}
        defaultValue={values?.title ?? ''}
        hint="A few words staff search by, for example accessory structure setbacks."
      />
    </>
  )
}

export function AddSection() {
  return (
    <FormDialog
      label="Add a section"
      title="Add a section"
      description="Sections on this list are suggested when staff record a finding of that kind."
      variant="default"
    >
      <ActionForm action={addSectionAction} submitLabel="Add section" closeOnSuccess>
        <SectionFields />
      </ActionForm>
    </FormDialog>
  )
}

export function EditSection({ sectionId, values }: { sectionId: string; values: SectionValues }) {
  return (
    <RowEditDialog record={values.reference} title={`Edit ${values.reference}`}>
      <ActionForm action={editSectionAction} submitLabel="Save changes" closeOnSuccess>
        <input type="hidden" name="sectionId" value={sectionId} />
        <SectionFields values={values} />
      </ActionForm>
    </RowEditDialog>
  )
}

export function RetireSection({ sectionId, reference }: { sectionId: string; reference: string }) {
  return (
    <ActionForm
      action={retireSectionAction}
      submitLabel="Retire"
      submitAccessibleLabel={`Retire ${reference}`}
      variant="outline"
      confirm={{
        title: `Retire ${reference}?`,
        body: 'It stops being suggested in findings. Findings that already cite it keep their text.',
        confirmLabel: 'Retire section',
      }}
      compact
    >
      <input type="hidden" name="sectionId" value={sectionId} />
    </ActionForm>
  )
}

export function AddTypedSection({ kind, reference }: { kind: TownSectionKind; reference: string }) {
  return (
    <ActionForm
      action={addSectionAction}
      submitLabel="Add"
      submitAccessibleLabel={`Add ${reference} to the list`}
      compact
    >
      <input type="hidden" name="provisionKind" value={kind} />
      <input type="hidden" name="reference" value={reference} />
    </ActionForm>
  )
}
