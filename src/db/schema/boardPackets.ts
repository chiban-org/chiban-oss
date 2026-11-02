import {
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { documents, documentVersions } from './documents'
import { citext } from './identity'
import { renditionApprovals } from './renditionApprovals'

export const boardPackets = pgTable('board_packets', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  board: text('board', { enum: ['planning_board', 'zba'] }).notNull(),
  meetingDate: date('meeting_date', { mode: 'string' }).notNull(),
  createdBy: uuid('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const boardPacketItems = pgTable(
  'board_packet_items',
  {
    packetId: uuid('packet_id')
      .notNull()
      .references(() => boardPackets.id),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id),
    versionId: uuid('version_id')
      .notNull()
      .references(() => documentVersions.id),
    position: integer('position').notNull(),
    approvalId: uuid('approval_id').references(() => renditionApprovals.id),
    withdrawnAt: timestamp('withdrawn_at', { withTimezone: true }),
    withdrawnReason: text('withdrawn_reason', { enum: ['revoked', 'disposed'] }),
  },
  (t) => [primaryKey({ columns: [t.packetId, t.documentId] })],
)

export const boardPacketLinks = pgTable(
  'board_packet_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    packetId: uuid('packet_id')
      .notNull()
      .references(() => boardPackets.id),
    recipientName: text('recipient_name').notNull(),
    recipientEmail: citext('recipient_email').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('board_packet_links_packet_idx').on(t.packetId)],
)

export const boardPacketAccess = pgTable(
  'board_packet_access',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    linkId: uuid('link_id')
      .notNull()
      .references(() => boardPacketLinks.id),
    versionId: uuid('version_id').references(() => documentVersions.id),
    accessedAt: timestamp('accessed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('board_packet_access_link_idx').on(t.linkId)],
)

export type BoardPacketRow = typeof boardPackets.$inferSelect
