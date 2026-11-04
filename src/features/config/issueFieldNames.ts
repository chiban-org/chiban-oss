import { words } from '@/lib/words'

const NAMES: ReadonlyMap<string, string> = new Map(
  Object.entries({
    key: 'Short name',
    label: 'Name',
    prefix: 'Number prefix',
    formKey: 'Form',
    feeScheduleKey: 'Fee schedule',
    conditionLibraryKey: 'Conditions',
    checklistKeys: 'Inspection checklists',
    checklists: 'Inspection checklists',
    templateKeys: 'Documents',
    references: 'Settings this type uses',
    bindings: 'State law rules',
    classification: 'Kind of proceeding',
    payTiming: 'When fees are paid',
    attestationText: 'Applicant statement',
    lines: 'Fees',
    conditions: 'Conditions',
    items: 'Checklist items',
    inspectionType: 'Inspection name',
    value: 'Town value',
    adoption: 'Adoption record',
    body: 'Document',
    workflow: 'Workflow',
  }),
)

export function issueFieldName(path: string): string {
  return NAMES.get(path) ?? words(path)
}
