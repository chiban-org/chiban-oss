import {
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { boardMeetings } from './boards'
import { documents, documentVersions } from './documents'
import { citext, users } from './identity'
import { renditionApprovals } from './renditionApprovals'

export const boardPackets = pgTable(
  'board_packets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    board: text('board', { enum: ['planning_board', 'zba'] }).notNull(),
    meetingDate: date('meeting_date', { mode: 'string' }).notNull(),
    meetingId: uuid('meeting_id').references(() => boardMeetings.id),
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    lastSentAt: timestamp('last_sent_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('board_packets_meeting_idx').on(t.meetingId)],
)

export const boardPacketItems = pgTable(
  'board_packet_items',
  {
    packetId: uuid('packet_id')
      .notNull()
      .references(() => boardPackets.id),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id),
    versionId: uuid('version_id').references(() => documentVersions.id),
    formerVersionId: uuid('former_version_id'),
    position: integer('position').notNull(),
    approvalId: uuid('approval_id').references(() => renditionApprovals.id),
    withdrawnAt: timestamp('withdrawn_at', { withTimezone: true }),
    withdrawnReason: text('withdrawn_reason', { enum: ['revoked', 'disposed'] }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    removedAt: timestamp('removed_at', { withTimezone: true }),
    removalSentAt: timestamp('removal_sent_at', { withTimezone: true }),
    replacesDocumentId: uuid('replaces_document_id'),
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
    linkId: uuid('link_id').references(() => boardPacketLinks.id),
    packetId: uuid('packet_id').references(() => boardPackets.id),
    userId: uuid('user_id'),
    versionId: uuid('version_id'),
    accessedAt: timestamp('accessed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('board_packet_access_link_idx').on(t.linkId),
    index('board_packet_access_packet_idx').on(t.packetId, t.userId),
  ],
)

export const boardPacketMembers = pgTable(
  'board_packet_members',
  {
    packetId: uuid('packet_id')
      .notNull()
      .references(() => boardPackets.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull(),
    lastSentAt: timestamp('last_sent_at', { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.packetId, t.userId] })],
)

export type BoardPacketRow = typeof boardPackets.$inferSelect
