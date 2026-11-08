import { gatedStages, missingNames, unmetItems } from '@/features/applications/documentChecklist'
import { documentItemsOf } from '@/features/applications/documentItemSchema'
import { loadItemRecords } from '@/features/applications/documentRecords'
import type { CoreState } from '@/features/applications/states'
import { type GateEvaluator, registerGate } from '@/features/gates/registry'

export const DOCUMENT_GATE_KEYS = {
  submitted: 'documents.to_file',
  decided: 'documents.before_decision',
  issued: 'documents.before_issue',
  closed: 'documents.before_co',
} as const

function documentsProvidedFor(to: CoreState): GateEvaluator {
  return async (tx, app) => {
    const items = documentItemsOf(app.typeBody)
    const stages = gatedStages(to, app.typeBody.workflow.closesOn)
    if (items.length === 0 || stages.length === 0) return { status: 'pass' }
    const records = await loadItemRecords(tx, app.id)
    const unmet = unmetItems(items, stages, app.values, records)
    if (unmet.length === 0) return { status: 'pass' }
    return { status: 'blocked', reason: `Documents not provided: ${missingNames(unmet)}.` }
  }
}

const GATES = [
  ['submitted', DOCUMENT_GATE_KEYS.submitted, 'Documents needed to file'],
  ['decided', DOCUMENT_GATE_KEYS.decided, 'Documents needed before the decision'],
  ['issued', DOCUMENT_GATE_KEYS.issued, 'Documents needed before issuance'],
  ['closed', DOCUMENT_GATE_KEYS.closed, 'Documents needed before the certificate of occupancy'],
] as const

for (const [to, key, label] of GATES) {
  registerGate({
    key,
    label,
    kind: 'administrative',
    appliesTo: [to],
    boundBy: null,
    evaluate: documentsProvidedFor(to),
  })
}
