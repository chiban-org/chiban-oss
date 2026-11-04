export const EXCLUDED_TABLES: Record<string, string> = {
  sessions: 'sign-in sessions are credentials and never leave the instance',
  magic_links: 'one-time sign-in tokens are credentials and never leave the instance',
  staff_account_links:
    'staff invite and password reset tokens are credentials and never leave the instance',
  upload_intents: 'temporary upload bookkeeping for files not yet ingested',
  simulated_processor_objects: 'state of the simulated card processor, not a town record',
  job_runs: 'operational state of the job scheduler',
  exports: 'export bookkeeping',
  job_effects: 'job de-duplication bookkeeping',
  health_alerts: 'operational state',
  alert_tests: 'operational state',
  worker_state: 'operational state',
  anonymous_intake_probe_tokens: 'short-lived probe secret',
  document_renditions: 'regenerable from the version',
  file_deletions: 'operational queue',
}
