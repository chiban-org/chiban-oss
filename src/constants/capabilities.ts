export const CAPABILITIES = {
  'permit.issue': 'Issue a permit or certificate',
  'gate.override_admin': 'Override an administrative gate with a recorded reason',
  'gate.record_statutory_exception': 'Record a statutory exception with cited legal authority',
  'payment.refund_void_correct': 'Refund, void, or correct a payment entry',
  'document.publish': 'Publish or unpublish a document',
  'hold.place_release': 'Place or release a legal hold',
  'disposition.approve': 'Approve disposition',
  'config.edit': 'Edit configuration',
  'project.manage_parties': 'Add or remove authorized parties on a project',
  'application.amend_after_review': 'Amend a submitted application after review starts',
  'parcel.manage':
    'Record lineage, override parcel IDs, carry records forward, resolve unresolved records, and disposition import exceptions',
  'gis.import': 'Run GIS layer imports',
  'clock.adjust': 'Extend or waive a clock where the rule allows it, with a recorded reason',
  'regional_impact.determine':
    'Record a regional impact determination and notices under the building permit rules',
  'fee.override': 'Waive or set a fee amount with a recorded reason',
  'payment.collect': 'Record counter payments and start card payments at the counter',
  'payment.report': 'View and export the daily cash receipts report',
  'review.assign': 'Assign and remove reviewers on an application',
  'document.manage':
    'Attach documents to any record, set document audiences, and retry preservation',
  'packet.manage': 'Create board packets and send or revoke their links',
  'inspection.schedule': 'Take inspection requests and schedule, reschedule, or cancel inspections',
  'inspection.record': 'Record inspection results and attach inspection photos',
  'export.download': 'Request and download the town records export',
  'export.recovery': 'Download the encrypted recovery export',
  'export.import': 'Restore an export archive into an empty instance',
  'report.view': 'View and download permit volume, processing time, and revenue reports',
  'cutover.import': 'Import open applications from the prior system and reconcile them',
} as const

export type Capability = keyof typeof CAPABILITIES

export const CAPABILITY_KEYS = Object.keys(CAPABILITIES) as Capability[]
