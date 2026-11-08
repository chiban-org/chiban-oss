import { doc } from '@packs/nh/starters/documentQuestions'
import { localPermitStarter } from '@packs/nh/starters/localPermit'

export const DRIVEWAY_STARTER = localPermitStarter({
  id: 'nh.starter.driveway',
  prefix: 'DW',
  slug: 'dw',
  label: 'Driveway permit',
  classification: 'nh.local_permit_other',
  payTiming: 'at_approval',
  allowsDirectIssue: false,
  feeCents: 5000,
  conditionText: 'Culvert and sight distance reviewed',
  closesOn: 'final_inspection_passed',
  version: 2,
  documents: [
    doc('driveway_sketch', 'Driveway sketch', {
      help: 'Show the location, width, grade, and any culvert.',
    }),
    doc('engineered_drawings', 'Engineered drawings', {
      requiredIf: { field: 'access_kind', op: 'in', value: ['commercial', 'subdivision'] },
    }),
  ],
  fields: [
    { key: 'road_name', label: 'Road the driveway meets', type: 'text', required: true },
    { key: 'culvert', label: 'Culvert needed', type: 'checkbox', required: false },
    {
      key: 'access_kind',
      label: 'What will the driveway serve?',
      type: 'select',
      required: false,
      options: [
        { value: 'residential', label: 'A home' },
        { value: 'commercial', label: 'A business' },
        { value: 'subdivision', label: 'A subdivision road or several lots' },
      ],
    },
  ],
  checklist: {
    key: 'driveway_final',
    inspectionType: 'final',
    label: 'Driveway final inspection',
    final: true,
    items: [{ key: 'final-1', label: 'Driveway built as permitted', required: true }],
  },
})
