'use server'

import { DECISION_OUTCOMES } from '@packs/nh/schema'
import { addAppealNode } from '@/features/appeals/graph'
import { errorOrOk } from '@/features/boards/actionResult'
import { generateDecisionDocuments } from '@/features/decisions/decisionDocuments'
import { fileDecision } from '@/features/decisions/fileDecision'
import { parseConditions, parseVotes } from '@/features/decisions/formParsing'
import { recordDecision } from '@/features/decisions/recordDecision'
import { recordRegionalTransmittal } from '@/features/decisions/regionalTransmittal'
import { getObjectStore } from '@/features/storage/objectStore'
import { type ActionResult, runStaffAction, text } from '@/server/actionRunner'
import { dateOf } from './actions'

const INVALID: ActionResult = { ok: false, error: 'Check the form fields and try again.' }
const APPEAL_KINDS = [
  'zba_appeal',
  'rehearing_motion',
  'rehearing_outcome',
  'court_petition',
  'zba_decision',
] as const

export async function recordDecisionAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const outcome = DECISION_OUTCOMES.find((o) => o === text(formData, 'outcome'))
    const votedOn = dateOf(formData, 'votedOn')
    const votes = parseVotes(text(formData, 'votes'))
    if (outcome === undefined || votedOn === null || votes === null) return INVALID
    const recorded = await recordDecision(
      db,
      actor,
      {
        applicationId: text(formData, 'applicationId'),
        hearingId: text(formData, 'hearingId'),
        votedOn,
        outcome,
        motion: text(formData, 'motion'),
        votes,
        findings: text(formData, 'findings'),
        conditions: parseConditions(text(formData, 'conditions')),
        reasonsForDisapproval: text(formData, 'reasons'),
      },
      signal,
    )
    return errorOrOk(recorded, 'Decision recorded. The filing deadline has started.')
  })
}

export async function generateDecisionDocumentsAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const made = await generateDecisionDocuments(
      db,
      getObjectStore(),
      actor,
      text(formData, 'decisionId'),
      signal,
    )
    return errorOrOk(made, 'Notice of Decision and decision letter created.')
  })
}

export async function fileDecisionAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const filedOn = dateOf(formData, 'filedOn')
    if (filedOn === null) return INVALID
    const filed = await fileDecision(
      db,
      actor,
      {
        decisionId: text(formData, 'decisionId'),
        filedOn,
        minutesDocumentId: text(formData, 'minutesDocumentId'),
      },
      signal,
    )
    if (!filed.ok) return errorOrOk(filed, '')
    return {
      ok: true,
      message: filed.value.late
        ? 'Decision filed late. A 30 day amendment window now runs from today.'
        : 'Decision and minutes filed and published.',
    }
  })
}

export async function transmittalAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const result = await recordRegionalTransmittal(db, actor, text(formData, 'decisionId'), signal)
    if (!result.ok) return errorOrOk(result, '')
    return {
      ok: true,
      message: result.value.met
        ? 'Every recipient has timely proof. The transmittal deadline is met.'
        : 'Transmittal checklist is ready. Record proof for each recipient.',
    }
  })
}

export async function addAppealNodeAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const kind = APPEAL_KINDS.find((k) => k === text(formData, 'kind'))
    const occurredOn = dateOf(formData, 'occurredOn')
    if (kind === undefined || occurredOn === null) return INVALID
    const outcome = text(formData, 'outcome')
    const added = await addAppealNode(
      db,
      actor,
      {
        parentId: text(formData, 'parentId'),
        kind,
        occurredOn,
        ...(outcome === '' ? {} : { outcome }),
        linkedComponent: text(formData, 'linked') === 'yes',
      },
      signal,
    )
    return errorOrOk(added, 'Recorded on the appeal graph.')
  })
}
