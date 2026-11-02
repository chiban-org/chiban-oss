import type { ConfigKind } from '@/features/config/kinds'

export function skeletonBody(kind: ConfigKind, key: string): unknown {
  switch (kind) {
    case 'form':
      return {
        key,
        label: key,
        fields: [
          { key: 'description', label: 'Description of work', type: 'textarea', required: true },
        ],
      }
    case 'fee_schedule':
      return {
        key,
        lines: [{ code: 'fee', label: 'Fee', due: 'at_approval', expr: { op: 'flat', cents: 0 } }],
      }
    case 'template':
      return { key, label: key, kind: 'permit', body: 'Permit {{application.number}}' }
    case 'condition_library':
      return {
        key,
        conditions: [{ code: 'CONDITION', text: 'Describe the condition', blocksIssuance: false }],
      }
    case 'inspection_checklist':
      return {
        key,
        inspectionType: 'final',
        label: key,
        items: [{ key: 'item-1', label: 'Describe the check', required: true }],
      }
    case 'town_rule_setting':
      return { ruleKey: key, value: 0 }
    case 'local_code_amendment':
      return {
        title: key,
        codeSection: 'Section',
        adoptingAuthority: 'Governing body',
        adoptedOn: '2027-01-01',
        reviewBoardConfirmedOn: null,
      }
    case 'application_type':
      return {
        key,
        label: key,
        prefix: 'XX',
        formKey: 'form-key',
        feeScheduleKey: 'fee-key',
        conditionLibraryKey: 'conditions-key',
        checklistKeys: [],
        templateKeys: [],
        payTiming: 'at_approval',
        attestationText: 'I attest that the information in this application is true and complete.',
        bindings: [],
        workflow: { allowsDirectIssue: false, substeps: [], closesOn: 'final_inspection_passed' },
      }
  }
}
