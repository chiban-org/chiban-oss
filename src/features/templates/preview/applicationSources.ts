import { desc, eq, isNotNull } from 'drizzle-orm'
import { applications, boardDecisions, boardMeetings, hearings } from '@/db/schema'
import { decisionDocumentInput } from '@/features/decisions/decisionDocuments'
import { OUTCOME_LABELS } from '@/features/decisions/labels'
import { hearingNoticeInput, recipientInput } from '@/features/hearings/noticeLetters'
import { loadPermitData } from '@/features/permits/permitData'
import { permitDocumentInput } from '@/features/permits/permitDocuments'
import {
  type PreviewScope,
  type PreviewSource,
  SAMPLE_LIMIT,
} from '@/features/templates/preview/previewTypes'
import { formatCivilDate } from '@/lib/formatDate'

async function applicationSamples({ db, signal }: PreviewScope, issuedOnly: boolean) {
  signal.throwIfAborted()
  const rows = await db
    .select({ id: applications.id, number: applications.number, state: applications.state })
    .from(applications)
    .where(issuedOnly ? eq(applications.state, 'issued') : isNotNull(applications.number))
    .orderBy(desc(applications.seq))
    .limit(SAMPLE_LIMIT)
  return rows.map((r) => ({ id: r.id, label: `${r.number} (${r.state.replaceAll('_', ' ')})` }))
}

async function applicationInput({ db, signal }: PreviewScope, id: string) {
  const data = await loadPermitData(db, id, signal)
  return data === null ? null : await permitDocumentInput(db, data, signal)
}

export const PERMIT_SOURCE: PreviewSource = {
  samples: (scope) => applicationSamples(scope, true),
  input: applicationInput,
}

export const PLACARD_SOURCE: PreviewSource = {
  samples: (scope) => applicationSamples(scope, true),
  async input(scope, id) {
    const input = await applicationInput(scope, id)
    if (input === null) return null
    return { frame: input.frame, context: input.context, title: input.title?.toUpperCase() }
  },
}

export const LETTER_SOURCE: PreviewSource = {
  samples: (scope) => applicationSamples(scope, false),
  input: applicationInput,
}

export const HEARING_NOTICE_SOURCE: PreviewSource = {
  async samples({ db, signal }) {
    signal.throwIfAborted()
    const rows = await db
      .select({
        id: hearings.noticeSetId,
        number: applications.number,
        date: boardMeetings.meetingDate,
      })
      .from(hearings)
      .innerJoin(applications, eq(applications.id, hearings.applicationId))
      .innerJoin(boardMeetings, eq(boardMeetings.id, hearings.meetingId))
      .where(isNotNull(hearings.noticeSetId))
      .orderBy(desc(hearings.createdAt))
      .limit(SAMPLE_LIMIT)
    return rows.map((r) => ({ id: r.id, label: `${r.number}, hearing ${formatCivilDate(r.date)}` }))
  },
  async input({ db, signal }, id) {
    const loaded = await hearingNoticeInput(db, id, signal)
    if (loaded === null) return null
    const first = loaded.recipients[0] ?? { recipientName: null, recipientAddress: null }
    return recipientInput(loaded.input, first)
  },
}

export const DECISION_SOURCE: PreviewSource = {
  async samples({ db, signal }) {
    signal.throwIfAborted()
    const rows = await db
      .select({
        id: boardDecisions.id,
        number: applications.number,
        outcome: boardDecisions.outcome,
        votedOn: boardDecisions.votedOn,
      })
      .from(boardDecisions)
      .innerJoin(applications, eq(applications.id, boardDecisions.applicationId))
      .orderBy(desc(boardDecisions.recordedAt))
      .limit(SAMPLE_LIMIT)
    return rows.map((r) => ({
      id: r.id,
      label: `${r.number}, ${OUTCOME_LABELS[r.outcome].toLowerCase()} ${formatCivilDate(r.votedOn)}`,
    }))
  },
  async input({ db, signal }, id) {
    const loaded = await decisionDocumentInput(db, id, signal)
    return loaded.ok ? loaded.value.input : null
  },
}
