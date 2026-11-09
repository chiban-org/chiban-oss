import { registerGate } from '@/features/gates/registry'
import { latestLicenseCheck } from './latestLicenseCheck'
import { LICENSE_GATE_KEY, licenseCheckApplies, licenseGateOutcome } from './licenseRules'

registerGate({
  key: LICENSE_GATE_KEY,
  label: 'State license active',
  kind: 'administrative',
  appliesTo: ['issued'],
  boundBy: null,
  relevantTo: (app) =>
    licenseCheckApplies({ classification: app.typeBody.classification, values: app.values }),
  evaluate: async (tx, app) => licenseGateOutcome(await latestLicenseCheck(tx, app.id)),
})
