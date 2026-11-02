import { randomUUID } from 'node:crypto'
import { type ClockRule, StartEventSchema } from '@packs/nh/schema'
import type { Db, Tx } from '@/db/client'
import type { ApplicationTypeBody } from '@/features/applications/applicationTypeSchema'
import { type ApplicationContext, loadApplicationContext } from '@/features/applications/context'
import type { CoreState } from '@/features/applications/states'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { computeMeetingBoundDue, meetingBoundSpec } from '@/features/clocks/meetingBound'
import { computeRuleDue, resolveRuleLength, rulesForEvent } from '@/features/clocks/ruleEngine'
import { effectiveBindings } from '@/features/config/bindings'
import { getVersion } from '@/features/config/store'
import type { ProjectFacts } from '@/features/forms/validateSubmission'
import { evaluateGates } from '@/features/gates/evaluateGates'
import { NOTICE_CHANNEL_LABELS } from '@/features/notices/channels'
import { planRequirement } from '@/features/notices/requirementPlan'
import { requirementsFor } from '@/features/notices/requirementsFor'
import { packHolidayCalendar } from '@/features/packs/holidays'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import { validateWorkflow, type WorkflowIssue } from '@/features/workflow/validateWorkflow'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export interface WorkflowPreviewStep {
  state: CoreState
  substeps: { key: string; label: string }[]
  gates: { key: string; label: string; kind: string; outcome: string }[]
  clocks: { ruleKey: string; label: string; due: CivilDate; consequence: string }[]
  notices: { requirementKey: string; label: string; channel: string; due: CivilDate }[]
}

export interface WorkflowPreview {
  steps: WorkflowPreviewStep[]
  issues: WorkflowIssue[]
}

export interface PreviewInput {
  versionId: string
  sampleApplicationId?: string
  sampleFacts?: ProjectFacts
  sampleDates: { received: CivilDate; accepted?: CivilDate; meeting?: CivilDate }
}

const PATH: CoreState[] = ['draft', 'submitted', 'under_review', 'decided', 'issued', 'closed']
const BASE_FACTS: ProjectFacts = { classification: null, dwellingUnits: null, afterTheFact: false }

class Rollback extends Error {
  constructor(readonly preview: WorkflowPreview) {
    super('preview rollback')
  }
}

type Dates = PreviewInput['sampleDates']

function eventPlacement(
  event: ClockRule['startEvent'],
  dates: Dates,
): { state: CoreState; on: CivilDate } | null {
  const accepted = dates.accepted ?? dates.received
  const meeting = dates.meeting ?? accepted
  switch (event) {
    case 'application_received':
      return { state: 'submitted', on: dates.received }
    case 'acceptance_meeting_set':
      return { state: 'submitted', on: meeting }
    case 'application_completed':
    case 'application_accepted':
      return { state: 'under_review', on: accepted }
    case 'permit_issued':
      return { state: 'issued', on: accepted }
    case 'regional_impact_notice_mailed':
      return { state: 'under_review', on: accepted }
    case 'administrative_decision':
    case 'board_vote':
    case 'decision_filed':
    case 'final_approval':
    case 'rehearing_vote':
      return { state: 'decided', on: meeting }
    case 'order_served':
    case 'judgment_entered':
    case 'rtk_request_received':
    case 'rtk_time_statement':
      return null
  }
}

function dueOf(rule: ClockRule, facts: ProjectFacts, start: CivilDate, dates: Dates): CivilDate {
  const pack = loadPack()
  const settingKey = 'fromSetting' in rule.length ? rule.length.fromSetting : null
  const setting = settingKey === null ? null : ruleByKey(pack, settingKey)
  const length = resolveRuleLength(rule, facts, setting, undefined)
  const spec = meetingBoundSpec(rule, pack)
  if (spec !== null) {
    return computeMeetingBoundDue({
      start,
      days: length.value,
      noticeLeadDays: spec.noticeLeadDays,
      nextRegularMeetingOnOrAfter: dates.meeting ?? null,
    }).due
  }
  return computeRuleDue(rule, length, start, packHolidayCalendar()).due
}

function clocksFor(body: ApplicationTypeBody, facts: ProjectFacts, dates: Dates) {
  const pack = loadPack()
  const bound = new Set(effectiveBindings(body, pack))
  const byState = new Map<CoreState, WorkflowPreviewStep['clocks']>()
  for (const event of StartEventSchema.options) {
    const eventFacts: ProjectFacts =
      event === 'board_vote' ? { ...facts, outcome: 'approved' } : facts
    const placed = eventPlacement(event, dates)
    if (placed === null) continue
    const { state, on } = placed
    for (const rule of rulesForEvent(pack.rules, event, bound, eventFacts)) {
      const list = byState.get(state) ?? []
      list.push({
        ruleKey: rule.key,
        label: rule.label,
        due: dueOf(rule, facts, on, dates),
        consequence: rule.consequence.text,
      })
      byState.set(state, list)
    }
  }
  return byState
}

function noticesFor(body: ApplicationTypeBody, facts: ProjectFacts, dates: Dates) {
  const classification = loadPack().classifications.find((c) => c.key === body.classification)
  const meeting = dates.meeting
  if (classification === undefined || meeting === undefined) return []
  const flags = { regionalImpact: facts.regionalImpact === true, desWithin: false }
  return requirementsFor(classification, flags).flatMap((rule) => {
    const plan = planRequirement(rule, {
      hearingDate: meeting,
      flags,
      townLeadDays: {},
      publicChoice: null,
    })
    return plan === null
      ? []
      : [
          {
            requirementKey: rule.key,
            label: rule.label,
            channel: NOTICE_CHANNEL_LABELS[plan.channel],
            due: plan.dueOn,
          },
        ]
  })
}

async function sampleContext(
  tx: Tx,
  body: ApplicationTypeBody,
  facts: ProjectFacts,
  input: PreviewInput,
  signal: AbortSignal,
): Promise<ApplicationContext> {
  const loaded =
    input.sampleApplicationId === undefined
      ? null
      : await loadApplicationContext(tx, input.sampleApplicationId, signal)
  if (loaded !== null) return { ...loaded, typeBody: body }
  return {
    id: randomUUID(),
    number: 'PREVIEW',
    projectId: randomUUID(),
    state: 'draft',
    substep: null,
    rowVersion: 1,
    facts,
    values: {},
    typeBody: body,
    pins: {
      applicationType: randomUUID(),
      form: randomUUID(),
      feeSchedule: randomUUID(),
      conditionLibrary: randomUUID(),
      checklists: [],
      templates: [],
    },
    receivedDate: input.sampleDates.received,
    completedDate: input.sampleDates.accepted ?? null,
    decidedOn: null,
    issuedOn: null,
  }
}

async function gatesFor(
  tx: Tx,
  app: ApplicationContext,
  state: CoreState,
  today: CivilDate,
  signal: AbortSignal,
): Promise<WorkflowPreviewStep['gates']> {
  try {
    return await tx.transaction(async (inner) => {
      const results = await evaluateGates(inner, app, state, today, signal)
      return results.map((g) => ({
        key: g.key,
        label: g.label,
        kind: g.kind,
        outcome: g.outcome.status,
      }))
    })
  } catch {
    return []
  }
}

async function buildPreview(
  tx: Tx,
  body: ApplicationTypeBody,
  input: PreviewInput,
  signal: AbortSignal,
): Promise<WorkflowPreview> {
  const facts = input.sampleFacts ?? BASE_FACTS
  const app = await sampleContext(tx, body, facts, input, signal)
  const clocks = clocksFor(body, facts, input.sampleDates)
  const notices = noticesFor(body, facts, input.sampleDates)
  const today = input.sampleDates.accepted ?? input.sampleDates.received
  const steps: WorkflowPreviewStep[] = []
  for (const state of PATH) {
    steps.push({
      state,
      substeps: body.workflow.substeps
        .filter((s) => s.state === state)
        .map((s) => ({ key: s.key, label: s.label })),
      gates: state === 'draft' ? [] : await gatesFor(tx, app, state, today, signal),
      clocks: clocks.get(state) ?? [],
      notices: state === 'under_review' ? notices : [],
    })
  }
  const classification = loadPack().classifications.find((c) => c.key === body.classification)
  return {
    steps,
    issues: classification === undefined ? [] : validateWorkflow(body.workflow, classification),
  }
}

export async function previewWorkflow(
  db: Db,
  actor: Actor,
  input: PreviewInput,
  signal: AbortSignal,
): Promise<Result<WorkflowPreview, 'forbidden' | 'not_draft'>> {
  signal.throwIfAborted()
  if (!(await requireCapability(db, actor.userId, 'config.edit', signal)).ok)
    return err('forbidden')
  const version = await getVersion(db, input.versionId, signal)
  if (version?.kind !== 'application_type' || version.status !== 'draft') return err('not_draft')
  try {
    await db.transaction(async (tx) => {
      throw new Rollback(await buildPreview(tx, version.body as ApplicationTypeBody, input, signal))
    })
  } catch (e) {
    if (e instanceof Rollback) return ok(e.preview)
    throw e
  }
  return err('not_draft')
}
