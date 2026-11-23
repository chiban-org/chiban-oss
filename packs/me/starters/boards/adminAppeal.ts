import {
  ABUTTER_NOTICE_LINE,
  BOARD_OF_APPEALS_WORKFLOW,
  boardStarter,
} from '@packs/me/starters/boards/shared'
import { doc } from '@packs/me/starters/permitParts'

export const ADMIN_APPEAL_STARTER = boardStarter({
  id: 'me.starter.boa_admin_appeal',
  prefix: 'AA',
  slug: 'aa',
  label: 'Administrative appeal',
  classification: 'me.boa_admin_appeal',
  fields: [
    {
      key: 'decision_appealed',
      label: 'Decision appealed',
      type: 'text',
      required: true,
    },
    {
      key: 'decision_by',
      label: 'Official or board that decided',
      type: 'text',
      required: true,
    },
    {
      key: 'decision_date',
      label: 'Date of the decision',
      type: 'date',
      required: true,
      fact: 'appealedDecisionDate',
    },
    {
      key: 'grounds',
      label: 'Grounds for the appeal',
      type: 'textarea',
      required: true,
    },
  ],
  noticeLine: ABUTTER_NOTICE_LINE,
  workflow: BOARD_OF_APPEALS_WORKFLOW,
  documents: [doc('decision_copy', 'Copy of the decision appealed')],
})
