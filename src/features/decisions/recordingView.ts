import { and, desc, eq, inArray } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { type boardDecisions, clocks, decisionRecordings } from '@/db/schema'
import type { ApplicationContext } from '@/features/applications/context'
import { classificationOfApplication } from '@/features/decisions/hearingOptional'
import { voidRuleKeys } from '@/features/decisions/recording'
import { recordingIsRequired } from '@/features/decisions/recordingRequired'
import { formatCivilDate } from '@/lib/formatDate'

const APPROVING = ['approved', 'approved_with_conditions']

export interface RecordingView {
  approvedOn: string | null
  approvedText: string | null
  minApproval: string
  recordedText: string | null
  voidDueText: string | null
  voidLapsed: boolean
  certificateChoices: { id: string; label: string }[]
}

async function voidClock(db: Db, applicationId: string, approvedOn: string | null) {
  const keys = voidRuleKeys()
  if (approvedOn === null || keys.length === 0) return null
  const [clock] = await db
    .select({ currentDue: clocks.currentDue, status: clocks.status })
    .from(clocks)
    .where(
      and(
        eq(clocks.applicationId, applicationId),
        inArray(clocks.ruleKey, keys),
        eq(clocks.startDate, approvedOn),
      ),
    )
    .orderBy(desc(clocks.createdAt))
    .limit(1)
  return clock ?? null
}

export async function loadRecordingView(
  db: Db,
  decision: typeof boardDecisions.$inferSelect,
  app: ApplicationContext,
  documents: { id: string; title: string }[],
): Promise<RecordingView | null> {
  if (!recordingIsRequired(classificationOfApplication(app))) return null
  if (!APPROVING.includes(decision.outcome)) return null
  const [recording] = await db
    .select()
    .from(decisionRecordings)
    .where(eq(decisionRecordings.decisionId, decision.id))
  const clock = await voidClock(db, decision.applicationId, decision.finalWrittenApprovalOn)
  return {
    approvedOn: decision.finalWrittenApprovalOn,
    approvedText:
      decision.finalWrittenApprovalOn === null
        ? null
        : formatCivilDate(decision.finalWrittenApprovalOn),
    minApproval: decision.votedOn,
    recordedText:
      recording === undefined
        ? null
        : `${recording.registry}, book ${recording.book}, page ${recording.page}, recorded ${formatCivilDate(recording.recordedOn)}`,
    voidDueText: clock === null ? null : formatCivilDate(clock.currentDue),
    voidLapsed: clock?.status === 'lapsed',
    certificateChoices: documents.map((d) => ({ id: d.id, label: d.title })),
  }
}
