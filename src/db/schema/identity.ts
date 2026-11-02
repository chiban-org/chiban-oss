import {
  bigint,
  boolean,
  customType,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

export const citext = customType<{ data: string }>({
  dataType() {
    return 'citext'
  },
})

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: citext('email').notNull().unique(),
  displayName: text('display_name').notNull(),
  kind: text('kind', { enum: ['staff', 'public'] }).notNull(),
  passwordHash: text('password_hash'),
  totpSecretEnc: text('totp_secret_enc'),
  totpEnabled: boolean('totp_enabled').notNull().default(false),
  totpLastCounter: bigint('totp_last_counter', { mode: 'number' }),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const userRoles = pgTable(
  'user_roles',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.role] })],
)

export const roleCapabilities = pgTable(
  'role_capabilities',
  {
    role: text('role').notNull(),
    capability: text('capability').notNull(),
  },
  (t) => [primaryKey({ columns: [t.role, t.capability] })],
)
