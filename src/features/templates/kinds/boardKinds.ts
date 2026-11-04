import {
  DECISION_LETTER_TEXT,
  HEARING_NOTICE_TEXT,
  NOTICE_OF_DECISION_TEXT,
} from '@packs/nh/starters/boards/shared'
import { doc, fields, heading, section } from '@/features/templates/doc/build'
import { textToDoc } from '@/features/templates/doc/textToDoc'
import {
  APPLICATION_FIELDS,
  type DocumentKindDef,
  MEETING_FIELDS,
} from '@/features/templates/kinds/kindTypes'
import type { MergeField } from '@/features/templates/mergeFields'

const DECISION_FIELDS: readonly MergeField[] = [
  ...APPLICATION_FIELDS,
  ...MEETING_FIELDS,
  'decision.outcome',
  'decision.votedOn',
  'decision.findings',
  'decision.conditions',
  'decision.reasons',
  'decision.conditionsSection',
  'decision.reasonsSection',
]

const APPEAL_RIGHTS = ['decision.appealRights'] as const

export const HEARING_NOTICE_KIND: DocumentKindDef = {
  label: 'Hearing notice',
  title: 'Hearing notice',
  record: 'Hearing with mailed notices',
  scale: 'document',
  fields: [
    ...APPLICATION_FIELDS,
    ...MEETING_FIELDS,
    'hearing.kind',
    'notice.recipientName',
    'notice.recipientAddress',
  ],
  sections: [],
  locked: [],
  defaultDoc: textToDoc(HEARING_NOTICE_TEXT),
}

export const NOTICE_OF_DECISION_KIND: DocumentKindDef = {
  label: 'Notice of decision',
  title: 'Notice of decision',
  record: 'Board decision',
  scale: 'document',
  fields: DECISION_FIELDS,
  sections: [],
  locked: APPEAL_RIGHTS,
  defaultDoc: textToDoc(NOTICE_OF_DECISION_TEXT, { lockedSources: APPEAL_RIGHTS }),
}

export const DECISION_LETTER_KIND: DocumentKindDef = {
  label: 'Decision letter',
  title: 'Decision letter',
  record: 'Board decision',
  scale: 'document',
  fields: DECISION_FIELDS,
  sections: [],
  locked: APPEAL_RIGHTS,
  defaultDoc: textToDoc(DECISION_LETTER_TEXT, { lockedSources: APPEAL_RIGHTS }),
}

export const AGENDA_KIND: DocumentKindDef = {
  label: 'Meeting agenda',
  title: 'Meeting agenda',
  record: 'Board meeting with an agenda',
  scale: 'document',
  fields: MEETING_FIELDS,
  sections: [
    { name: 'agenda.items', label: 'Agenda items' },
    { name: 'agenda.itemNotes', label: 'Item details' },
  ],
  locked: [],
  defaultDoc: doc(
    fields([
      ['Board', 'board.name'],
      ['Date', 'meeting.date'],
      ['Time', 'meeting.time'],
      ['Location', 'meeting.location'],
    ]),
    heading('Items'),
    section('agenda.items'),
    section('agenda.itemNotes'),
  ),
}

export const BOARD_PACKET_COVER_KIND: DocumentKindDef = {
  label: 'Board packet cover',
  title: 'Board packet',
  record: 'Board packet',
  scale: 'document',
  fields: ['packet.title', 'board.name', 'meeting.date'],
  sections: [{ name: 'packet.contents', label: 'Packet contents' }],
  locked: [],
  defaultDoc: doc(heading('Contents'), section('packet.contents')),
}
