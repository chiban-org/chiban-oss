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
  fields: [
    { key: 'road_name', label: 'Road the driveway meets', type: 'text', required: true },
    { key: 'culvert', label: 'Culvert needed', type: 'checkbox', required: false },
  ],
  checklist: {
    key: 'driveway_final',
    inspectionType: 'final',
    label: 'Driveway final inspection',
    final: true,
    items: [{ key: 'final-1', label: 'Driveway built as permitted', required: true }],
  },
})
