import {
  ABUTTER_NOTICE_LINE,
  boardStarter,
  PLANNING_BOARD_WORKFLOW,
} from '@packs/me/starters/boards/shared'
import { doc } from '@packs/me/starters/permitParts'

export const SITE_PLAN_STARTER = boardStarter({
  id: 'me.starter.pb_site_plan',
  prefix: 'SPR',
  slug: 'spr',
  label: 'Site plan review',
  classification: 'me.pb_site_plan',
  fields: [
    {
      key: 'building_footprint_sq_ft',
      label: 'Ground area covered by buildings (square feet)',
      type: 'integer',
      required: true,
      significanceFact: true,
      validation: { min: 0 },
    },
    {
      key: 'gross_floor_area_sq_ft',
      label: 'Gross floor area (square feet)',
      type: 'integer',
      required: true,
      significanceFact: true,
      validation: { min: 0 },
    },
    {
      key: 'disturbed_acres',
      label: 'Area covered by buildings, parking, roads, paved and graded areas (acres)',
      type: 'decimal',
      required: false,
      significanceFact: true,
      validation: { min: 0 },
    },
    {
      key: 'proposed_use',
      label: 'Proposed use',
      type: 'text',
      required: true,
    },
  ],
  noticeLine: ABUTTER_NOTICE_LINE,
  workflow: PLANNING_BOARD_WORKFLOW,
  documents: [
    doc('site_plan', 'Site plan'),
    doc('project_narrative', 'Project narrative'),
    doc('state_permits', 'State or federal permits the project needs', {
      stage: 'before_decision',
      stateOrFederalPermit: true,
      optional: true,
    }),
  ],
})
