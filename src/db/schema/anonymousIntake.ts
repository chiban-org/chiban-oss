import { boolean, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const anonymousIntakeVerifications = pgTable('anonymous_intake_verifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  imageRef: text('image_ref'),
  appVersion: text('app_version').notNull(),
  caddyfileSha256: text('caddyfile_sha256').notNull(),
  ranAt: timestamp('ran_at', { withTimezone: true }).notNull().defaultNow(),
  passed: boolean('passed').notNull(),
  findings: jsonb('findings').notNull(),
})

export const anonymousIntakeProbeTokens = pgTable('anonymous_intake_probe_tokens', {
  tokenHash: text('token_hash').primaryKey(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
})
