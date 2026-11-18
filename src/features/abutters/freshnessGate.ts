import { AppError, ErrorIds } from '@/constants/errorIds'
import { listIsFreshAtFiling } from '@/features/abutters/proximityRule'
import { currentIssuedList } from '@/features/abutters/queries'
import { type GateDefinition, registerGate } from '@/features/gates/registry'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import { packRoles } from '@/features/packs/roles'
import { formatCivilDate } from '@/lib/formatDate'
import type { CivilDate } from '@/types/civilDate'

export const LIST_ISSUED_GATE_KEY = 'abutters.list_issued'
const RSA_676_4 = 'https://gc.nh.gov/rsa/html/LXIV/676/676-4.htm'

function ageRule(key: string) {
  const rule = ruleByKey(loadPack(), key)
  if (rule.kind !== 'list_age') {
    throw new AppError(
      ErrorIds.PACK_UNKNOWN_RULE,
      'The abutter list age rule is not a list age rule',
      {
        key,
      },
    )
  }
  return rule
}

function needsAbutters(classificationKey: string | undefined): boolean {
  return loadPack().classifications.find((c) => c.key === classificationKey)?.abutters != null
}

export function listFreshGateDefinitions(): GateDefinition[] {
  const gateKey = packRoles().gates.abutterListFresh
  const ruleKey = packRoles().rules.abutterListAge
  if (gateKey === null || ruleKey === null) return []
  return [
    {
      key: gateKey,
      label: 'Abutter list drawn no more than 5 days before filing',
      citation: ageRule(ruleKey).citation,
      kind: 'statutory',
      appliesTo: ['under_review'],
      boundBy: ruleKey,
      evaluate: async (tx, app, _today, signal) => {
        const list = await currentIssuedList(tx, app.id, signal)
        if (list === null) return { status: 'blocked', reason: 'No issued abutter list.' }
        if (app.receivedDate === null) {
          return { status: 'unknown', reason: 'The application has no filing date yet.' }
        }
        const rule = ageRule(ruleKey)
        if (listIsFreshAtFiling(rule, list.drawnOn as CivilDate, app.receivedDate)) {
          return { status: 'pass' }
        }
        return {
          status: 'blocked',
          reason: `Abutter list drawn ${formatCivilDate(list.drawnOn)}, more than ${rule.maxDaysBeforeFiling} days before filing on ${formatCivilDate(app.receivedDate)} (${rule.citation.label}).`,
        }
      },
    },
  ]
}

for (const gate of listFreshGateDefinitions()) registerGate(gate)

registerGate({
  key: LIST_ISSUED_GATE_KEY,
  label: 'Abutter list issued',
  citation: { label: 'RSA 676:4 I(d) and RSA 676:7 I', url: RSA_676_4 },
  kind: 'statutory',
  appliesTo: ['under_review'],
  boundBy: null,
  evaluate: async (tx, app, _today, signal) => {
    if (!needsAbutters(app.typeBody.classification)) return { status: 'pass' }
    const list = await currentIssuedList(tx, app.id, signal)
    return list === null
      ? { status: 'blocked', reason: 'No issued abutter list.' }
      : { status: 'pass' }
  },
})
