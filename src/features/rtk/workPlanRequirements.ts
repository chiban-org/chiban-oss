import { isRequestOpen } from '@/features/rtk/requestStatus'
import { formatCivilDate } from '@/lib/formatDate'
import type {
  PlanApproval,
  RequestPlanInput,
  RequirementGroup,
  RequirementRow,
} from './workPlanTypes'

export function isPending(a: PlanApproval): boolean {
  return !a.revoked && a.releasedIn === null
}

function firstResponseDetail(request: RequestPlanInput['request']): string {
  const t = request.timeliness
  switch (t.kind) {
    case 'responded_late':
      return `Sent late: due ${formatCivilDate(t.dueOn)}, sent ${formatCivilDate(t.respondedOn)}.`
    case 'responded_on_time':
      return `Sent on time, ${formatCivilDate(t.respondedOn)}.`
    case 'overdue':
      return `Due ${formatCivilDate(t.dueOn)}. It is late.`
    case 'due_today':
      return 'Due today.'
    case 'running':
      return `Due ${formatCivilDate(t.dueOn)}.`
  }
}

function firstResponseGroup(request: RequestPlanInput['request']): RequirementGroup {
  const done = request.firstResponseOn !== null
  return {
    key: 'first_response',
    title: 'First response',
    items: [
      {
        key: 'first_response',
        done,
        label: 'First response sent',
        detail: firstResponseDetail(request),
        anchor: done ? 'first-response' : 'do-this-now',
      },
    ],
  }
}

function denialGroup(request: RequestPlanInput['request']): RequirementGroup {
  return {
    key: 'denial',
    title: 'Before a denial',
    items: [
      {
        key: 'withheld',
        done: request.withholdings > 0,
        label: 'A withheld record with its exemption and explanation',
        detail: 'A denial names the exemption and explains how it applies to each record withheld.',
        anchor: 'withholdings',
      },
    ],
  }
}

function releaseGroup(input: RequestPlanInput): RequirementGroup {
  const pending = input.approvals.filter(isPending)
  const items: RequirementRow[] = [
    {
      key: 'approved',
      done: pending.length > 0,
      label: 'Each version approved for this request',
      detail: 'Only a version approved for this request, or for the public, can be released.',
      anchor: 'do-this-now',
    },
    {
      key: 'cited',
      done: pending.every((a) => !a.redacted || a.cited),
      label: 'Each redacted copy has its exemptions drawn',
      detail: 'A redacted copy is released only when each box carries its exemption.',
      anchor: 'do-this-now',
    },
  ]
  return { key: 'release', title: 'Before records are released', items }
}

export function requirementGroups(input: RequestPlanInput): RequirementGroup[] {
  const { status } = input.request
  const groups = [firstResponseGroup(input.request)]
  if (status === 'open' || status === 'awaiting_decision') groups.push(denialGroup(input.request))
  if (isRequestOpen(input.request)) groups.push(releaseGroup(input))
  return groups
}
