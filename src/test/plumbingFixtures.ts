import type { Db } from '@/db/client'
import type { ApplicationTypeBody } from '@/features/applications/applicationTypeSchema'
import { getPublished } from '@/features/config/store'
import type { StatePack } from '@/features/packs/schema'
import { type MadeApplication, makeApplication } from '@/test/applicationFixtures'
import { saveAndPublish } from '@/test/configFixtures'
import { INSPECTION_NOW, type InspectionWorld } from '@/test/inspectionFixtures'
import { XX_PACK } from '@/test/packs/xx'
import { xxPackWith } from '@/test/packs/xx/variants'

const signal = new AbortController().signal

export const PLUMBING_CLASSIFICATION = 'xx.internal_plumbing'
export const PLUMBING_TYPE = 'PL'

export const PLUMBING_PACK: StatePack = xxPackWith({
  roles: { classifications: { plumbingInspectorOwns: [PLUMBING_CLASSIFICATION] } },
  manifest: {
    classifications: [
      ...XX_PACK.manifest.classifications,
      {
        key: PLUMBING_CLASSIFICATION,
        label: 'Internal plumbing',
        mandatoryRuleKeys: [],
        boardKind: null,
        abutters: null,
        noticeRequirementKeys: [],
        requiredSubsteps: [],
        directIssueAllowed: true,
        hearing: 'required',
        recordingRequired: false,
        appealRights: 'A decision may be appealed under Vellmora Permit Act 9.',
      },
    ],
  },
})

export async function publishPlumbingType(db: Db, w: InspectionWorld): Promise<void> {
  const electrical = await getPublished(db, 'application_type', 'EL', signal)
  const body = electrical?.body as ApplicationTypeBody
  await saveAndPublish(db, w.world.admin, 'application_type', PLUMBING_TYPE, {
    ...body,
    key: PLUMBING_TYPE,
    label: 'Internal plumbing permit',
    prefix: 'PL',
    classification: PLUMBING_CLASSIFICATION,
    bindings: [],
    workflow: { ...body.workflow, allowsDirectIssue: true },
  })
}

export async function issuedPlumbingPermit(db: Db, w: InspectionWorld): Promise<MadeApplication> {
  return await makeApplication(
    db,
    w.world,
    { state: 'issued', issuedOn: '2027-06-20' },
    INSPECTION_NOW,
    PLUMBING_TYPE,
  )
}
