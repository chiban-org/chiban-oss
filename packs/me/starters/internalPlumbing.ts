import {
  AFTER_THE_FACT,
  checklist,
  countField,
  lateDoubled,
  perCount,
  permitStarter,
} from '@packs/me/starters/permitParts'
import type { FeeScheduleBody } from '@/features/fees/feeSchema'

const TABLE_A = '10-144 CMR ch 240 Table A'
const TEN_DOLLARS = 1000

function tableALine(code: string, field: string, label: string): FeeScheduleBody['lines'][number] {
  return {
    code,
    label: `${label} (${TABLE_A})`,
    due: 'at_intake',
    expr: lateDoubled(perCount(field, TEN_DOLLARS)),
  }
}

export const INTERNAL_PLUMBING_STARTER = permitStarter({
  id: 'me.starter.internal_plumbing',
  prefix: 'IP',
  slug: 'ip',
  label: 'Internal plumbing permit',
  classification: 'me.internal_plumbing',
  payTiming: 'at_intake',
  allowsDirectIssue: true,
  fields: [
    {
      key: 'contractor_license_number',
      label: 'Maine plumbing license number, when a licensed plumber does the work',
      type: 'text',
      required: false,
    },
    countField('fixture_count', 'Number of fixtures'),
    countField('public_sewer_hookups', 'Hook-ups to a public sewer'),
    countField('subsurface_hookups', 'Hook-ups to an existing subsurface system'),
    countField('piping_relocations', 'Piping relocations with no new fixtures'),
    countField('permit_transfers', 'Permit transfers'),
    AFTER_THE_FACT,
  ],
  feeLines: [
    {
      code: 'fixtures',
      label: `Fixtures, minimum fee includes up to four (${TABLE_A})`,
      due: 'at_intake',
      expr: lateDoubled({
        op: 'minimum',
        cents: 4000,
        of: perCount('fixture_count', TEN_DOLLARS),
      }),
    },
    tableALine('public_sewer_hookup', 'public_sewer_hookups', 'Hook up to public sewer'),
    tableALine('subsurface_hookup', 'subsurface_hookups', 'Hook up to existing subsurface system'),
    tableALine('piping_relocation', 'piping_relocations', 'Piping relocation with no new fixtures'),
    tableALine('permit_transfer', 'permit_transfers', 'Permit transfer'),
  ],
  conditions: [
    {
      code: 'PLUMBER',
      text: 'Plumber of record confirmed by the local plumbing inspector',
      blocksIssuance: true,
    },
  ],
  checklists: [
    checklist({
      slug: 'ip',
      inspectionType: 'rough',
      label: 'Rough plumbing inspection',
      items: ['Rough-in installed and accessible'],
      final: false,
    }),
    checklist({
      slug: 'ip',
      inspectionType: 'final',
      label: 'Final plumbing inspection',
      items: ['Installation complete and operable'],
      final: true,
    }),
  ],
  documents: [],
  closesOn: 'final_inspection_passed',
  permitDetails:
    'Plumber {{permit.contractorWithLicense}}. Issued {{application.issuedOn}}, work to begin by {{application.expiresOn}}.',
})
