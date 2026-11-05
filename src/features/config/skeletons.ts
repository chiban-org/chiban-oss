import { NH_INSPECTION_SETTINGS_DEFAULT } from '@packs/nh/starters'
import { BOARD_SETTINGS_DEFAULT } from '@/features/boards/boardSettings'
import { EMPTY_REGIONAL_CONTACTS } from '@/features/boards/regionalContacts'
import { settingDefault } from '@/features/clocks/ruleEngine'
import type { ConfigKind } from '@/features/config/kinds'
import { prefixFromLabel } from '@/features/config/newItemKey'
import { slugKey } from '@/features/forms/fieldKeys'
import { loadPack } from '@/features/packs/loadPack'
import { EMPTY_REVIEW_ROUTES } from '@/features/reviews/routesSchema'
import { defaultDoc } from '@/features/templates/kinds/documentKinds'
import { TOWN_PROFILE_SKELETON } from '@/features/town/profileSchema'

function inspectionTypeFor(label: string): string {
  return slugKey(label.replace(/\s*inspection\s*$/i, ''))
}

export function skeletonBody(kind: ConfigKind, key: string, label: string = key): unknown {
  switch (kind) {
    case 'form':
      return {
        key,
        label,
        fields: [
          { key: 'description', label: 'Description of work', type: 'textarea', required: true },
        ],
      }
    case 'fee_schedule':
      return {
        key,
        label,
        lines: [{ code: 'fee', label: 'Fee', due: 'at_approval', expr: { op: 'flat', cents: 0 } }],
      }
    case 'template':
      return { key, label, kind: 'letter', format: 'doc', doc: defaultDoc('letter') }
    case 'condition_library':
      return {
        key,
        label,
        conditions: [{ code: 'C1', text: 'Describe the condition', blocksIssuance: false }],
      }
    case 'inspection_checklist':
      return {
        key,
        inspectionType: inspectionTypeFor(label),
        label,
        final: false,
        items: [{ key: 'item-1', label: 'Describe the check', required: true }],
      }
    case 'town_rule_setting':
      return {
        ruleKey: key,
        value: settingDefault(loadPack().rules.find((r) => r.key === key) ?? null),
      }
    case 'local_code_amendment':
      return {
        title: label,
        codeSection: 'Section',
        adoptingAuthority: 'Governing body',
        adoptedOn: '2027-01-01',
        reviewBoardConfirmedOn: null,
      }
    case 'payment_settings':
      return {
        key: 'default',
        convenienceFee: { basisPoints: 0, fixedCents: 0, appliesTo: [] },
        receiptFooter: '',
        checksPayableTo: 'the Town',
      }
    case 'inspection_settings':
      return NH_INSPECTION_SETTINGS_DEFAULT
    case 'board_settings':
      return BOARD_SETTINGS_DEFAULT
    case 'regional_contacts':
      return EMPTY_REGIONAL_CONTACTS
    case 'review_routes':
      return EMPTY_REVIEW_ROUTES
    case 'town_profile':
      return TOWN_PROFILE_SKELETON
    case 'application_type':
      return {
        key,
        label,
        prefix: prefixFromLabel(label),
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
