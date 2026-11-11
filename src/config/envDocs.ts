import type { EnvSetting } from '@/config/envSchema'

export const ENV_DOC_GROUPS = [
  { key: 'core', title: 'Application' },
  { key: 'mail', title: 'Mail' },
  { key: 'storage', title: 'Object storage' },
  { key: 'documents', title: 'Document preservation' },
  { key: 'backups', title: 'Backups and exports' },
  { key: 'health', title: 'Health alerts' },
  { key: 'payments', title: 'Payments' },
  { key: 'address', title: 'Address checks' },
  { key: 'demo', title: 'Demo and development' },
] as const

export type EnvDocGroup = (typeof ENV_DOC_GROUPS)[number]['key']

export interface EnvSettingDoc {
  group: EnvDocGroup
  text: string
}

export const ENV_DOCS = {
  NODE_ENV: {
    group: 'core',
    text: 'The mode the application runs in. The application image sets `production`. Several development aids refuse to run in production.',
  },
  PORT: {
    group: 'core',
    text: 'The port the web application listens on. Next.js reads it when the server starts.',
  },
  LOG_LEVEL: {
    group: 'core',
    text: 'Accepted and checked at startup. No part of Chiban reads it at present.',
  },
  DATABASE_URL: {
    group: 'core',
    text: 'The PostgreSQL connection URL. The database needs the PostGIS extension.',
  },
  BASE_URL: {
    group: 'core',
    text: 'The public address of the application, for example `https://town.example.org`. Links in email and the browser upload rule for object storage are built from it.',
  },
  CHIBAN_SECRET_KEYS: {
    group: 'core',
    text: 'A JSON object that maps a key id to a base64 encoding of exactly 32 random bytes. Saved credentials, such as payment processor keys, authenticator app secrets and export target secrets, are encrypted with these keys. Keep a copy outside the server: encrypted data cannot be read without it.',
  },
  CHIBAN_ACTIVE_KEY_ID: {
    group: 'core',
    text: 'The id of the key in `CHIBAN_SECRET_KEYS` used to encrypt new values. Older keys stay in the object so existing values can still be read.',
  },
  CHIBAN_IMAGE_REF: {
    group: 'core',
    text: 'The application image reference, pinned by digest. The bundled Compose file sets it from `CHIBAN_IMAGE`. Anonymous complaint intake opens only when a passing verification exists for this exact image.',
  },
  MAX_UPLOAD_BYTES: {
    group: 'core',
    text: 'The largest file a person can upload, in bytes. The default is 100 MiB.',
  },
  PATH: {
    group: 'core',
    text: 'The usual executable search path. It is passed on to the database dump tool when a recovery export is built.',
  },
  NEXT_RUNTIME: {
    group: 'core',
    text: 'Set by Next.js itself. Do not set it.',
  },
  SMTP_URL: {
    group: 'mail',
    text: 'The SMTP server outgoing mail is sent through, as a URL such as `smtp://user:password@mail.example.org:587`.',
  },
  MAIL_FROM: {
    group: 'mail',
    text: 'The sender of every email Chiban sends, including calendar invitations.',
  },
  S3_ENDPOINT: {
    group: 'storage',
    text: 'The address the application and worker use to reach object storage.',
  },
  S3_PUBLIC_ENDPOINT: {
    group: 'storage',
    text: 'The address browsers use for upload and download links. In the bundled deployment it is `https://s3.` followed by the application domain.',
  },
  S3_BUCKET: {
    group: 'storage',
    text: 'The bucket that holds stored documents, uploads and exports.',
  },
  S3_ACCESS_KEY_ID: {
    group: 'storage',
    text: 'The name of the object storage access key. Garage needs at least 8 characters.',
  },
  S3_SECRET_ACCESS_KEY: {
    group: 'storage',
    text: 'The secret of the object storage access key.',
  },
  S3_REGION: {
    group: 'storage',
    text: 'The region name sent with object storage requests.',
  },
  S3_CORS_ORIGINS: {
    group: 'storage',
    text: 'Comma-separated origins allowed to upload straight to the bucket. When empty, the origin of `BASE_URL` is used. `pnpm storage:init` applies the rule.',
  },
  GARAGE_ADMIN_ENDPOINT: {
    group: 'storage',
    text: 'The Garage admin API address. Only the storage setup step uses it.',
  },
  GARAGE_ADMIN_TOKEN: {
    group: 'storage',
    text: 'The Garage admin API token. Only the storage setup step uses it.',
  },
  GHOSTSCRIPT_PATH: {
    group: 'documents',
    text: 'The Ghostscript command, used to make PDF/A copies and to apply redactions.',
  },
  GHOSTSCRIPT_ICC_PROFILE: {
    group: 'documents',
    text: 'An ICC color profile for PDF/A copies. When unset, the sRGB profile that ships with Ghostscript is used.',
  },
  OCRMYPDF_PATH: {
    group: 'documents',
    text: 'The OCRmyPDF command, used to make scanned files searchable.',
  },
  VERAPDF_PATH: {
    group: 'documents',
    text: 'The veraPDF command, used to check PDF/A copies. When it is missing, copies are kept and marked as not validated.',
  },
  PG_DUMP_PATH: {
    group: 'backups',
    text: 'The `pg_dump` command used by backups and the recovery export.',
  },
  PG_RESTORE_PATH: {
    group: 'backups',
    text: 'The `pg_restore` command used by the restore check and the anonymous intake verification.',
  },
  BACKUP_PASSPHRASE: {
    group: 'backups',
    text: 'The passphrase backups are encrypted with. The backup and restore check scripts refuse to run without it.',
  },
  EXPORT_WORK_DIR: {
    group: 'backups',
    text: 'A scratch folder for building exports, importing archives and checking restores.',
  },
  ALERT_EMAIL_TO: {
    group: 'health',
    text: 'Comma-separated email addresses that receive health alerts. When empty, no alert email is sent.',
  },
  HEALTH_DISK_PATHS: {
    group: 'health',
    text: 'Comma-separated paths whose disk usage the health check watches. It warns at 80 percent full and raises a critical alert at 90 percent.',
  },
  HEALTH_HEARTBEAT_URL: {
    group: 'health',
    text: 'A URL the health check calls on every run, for an outside monitor that alerts when the calls stop.',
  },
  PAGER_EVENTS_URL: {
    group: 'health',
    text: 'The events address for pager alerts. When unset, the PagerDuty Events API v2 address is used.',
  },
  PAGER_ROUTING_KEY: {
    group: 'health',
    text: 'The routing key for pager alerts. Pager alerts are sent only when it is set.',
  },
  ENABLE_SIMULATED_PAYMENTS: {
    group: 'payments',
    text: 'Turns on the simulated payment processor, which backs the in-app checkout page and the counter card reader panel. Both say on screen that no live processor is connected.',
  },
  STRIPE_API_BASE: {
    group: 'payments',
    text: 'Points the Stripe adapter at another address, such as a local `stripe-mock` on port 12111, for development.',
  },
  USPS_CLIENT_ID: {
    group: 'address',
    text: 'The Consumer Key of an app registered at developers.usps.com. With neither USPS credential set, address fields work as plain text and nothing is sent.',
  },
  USPS_CLIENT_SECRET: {
    group: 'address',
    text: 'The Consumer Secret of the same USPS app.',
  },
  USPS_API_BASE: {
    group: 'address',
    text: 'The USPS Addresses API address. Use `https://apis-tem.usps.com` for the USPS testing environment.',
  },
  USPS_STUB: {
    group: 'address',
    text: 'Answers address checks from a local stand-in, so the suggestion can be tried without credentials.',
  },
  ENABLE_DEV_SIGN_IN: {
    group: 'demo',
    text: 'Turns on `/dev/sign-in`, which signs in as any seeded demo user without a password. It works only outside production.',
  },
  CHIBAN_DEMO_MODE: {
    group: 'demo',
    text: 'Runs the installation as a public demo: the Try the demo page, the demo notice, simulated payments only, and refusal of changes that would affect every visitor. The reset to the fictional Town of Alder Pond is `pnpm demo:reset`, run on a schedule you set up.',
  },
  CHIBAN_DEMO_RESET_AT: {
    group: 'demo',
    text: 'The reset time shown in the demo notice, as free text of up to 60 characters. It does not schedule the reset.',
  },
  CHIBAN_DEMO_MAIL_SINK_HOSTS: {
    group: 'demo',
    text: 'Comma-separated mail hosts a demo may send to, so demo mail never leaves the server.',
  },
  CHIBAN_DEMO_OVERLAY_FILE: {
    group: 'demo',
    text: 'Path to a demo overlay file applied on every demo reset.',
  },
  CHIBAN_TERMS_FILE: {
    group: 'demo',
    text: 'Path to a banned-terms file for the term gate, a repository check. The application does not read it.',
  },
} as const satisfies Record<EnvSetting, EnvSettingDoc>
