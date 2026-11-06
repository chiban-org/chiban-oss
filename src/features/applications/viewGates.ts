import type { Db } from '@/db/client'
import { boardOfApplication } from '@/features/boards/boardOf'
import { evaluateGates, type GateResult } from '@/features/gates/evaluateGates'
import type { CivilDate } from '@/types/civilDate'
import type { ApplicationContext } from './context'
import type { CoreState } from './states'
import { requirementTargets } from './workPath'

export type GateGroups = { to: CoreState; results: GateResult[] }[]

export async function evaluateViewGates(
  db: Db,
  input: { app: ApplicationContext; nextTransitions: readonly CoreState[]; today: CivilDate },
  signal: AbortSignal,
): Promise<{ gates: GateGroups; gatesAhead: GateGroups }> {
  const { app, nextTransitions, today } = input
  const board = boardOfApplication(app) !== null
  const ahead = requirementTargets(app.state, app.typeBody.workflow, board).filter(
    (to) => !nextTransitions.includes(to),
  )
  return await db.transaction(async (tx) => {
    const evaluate = async (targets: readonly CoreState[]) => {
      const out: GateGroups = []
      for (const to of targets)
        out.push({ to, results: await evaluateGates(tx, app, to, today, signal) })
      return out
    }
    return { gates: await evaluate(nextTransitions), gatesAhead: await evaluate(ahead) }
  })
}
