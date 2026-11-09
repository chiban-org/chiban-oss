'use client'

import type { ReactNode } from 'react'
import { useLiveAnswers } from '@/components/portal/liveAnswers'
import type { ItemStatus } from '@/features/applications/documentChecklist'
import { liveStatus } from '@/features/applications/liveChecklist'
import type { Condition } from '@/features/forms/condition'

export interface LiveRule {
  status: ItemStatus
  requiredIf: Condition | null
  optional: boolean
}

function useLiveStatus(rule: LiveRule): ItemStatus {
  const answers = useLiveAnswers()
  return answers === null ? rule.status : liveStatus(rule, answers)
}

export function LiveRowGate({
  rule,
  show,
  children,
}: {
  rule: LiveRule
  show: 'needed' | 'not_needed'
  children: ReactNode
}) {
  const notNeeded = useLiveStatus(rule) === 'not_needed'
  return notNeeded === (show === 'not_needed') ? children : null
}

export function NotNeededGroup({ rules, children }: { rules: LiveRule[]; children: ReactNode }) {
  const answers = useLiveAnswers()
  const count = rules.filter(
    (rule) => (answers === null ? rule.status : liveStatus(rule, answers)) === 'not_needed',
  ).length
  if (count === 0) return null
  return (
    <details className="border-t border-hairline pt-3">
      <summary className="tap-target inline-flex cursor-pointer items-center font-medium">
        {`Not needed for this project (${count})`}
      </summary>
      <ul className="m-0 list-none p-0">{children}</ul>
    </details>
  )
}

export function LiveStageGate({ rules, children }: { rules: LiveRule[]; children: ReactNode }) {
  const answers = useLiveAnswers()
  const shown = rules.some(
    (rule) => (answers === null ? rule.status : liveStatus(rule, answers)) !== 'not_needed',
  )
  return shown ? children : null
}
