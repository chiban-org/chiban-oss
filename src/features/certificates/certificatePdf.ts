import type { DbOrTx } from '@/db/client'
import { documentFrame } from '@/features/pdf/documentFrame'
import { loadPermitData, mergeContextOf } from '@/features/permits/permitData'
import { townTemplate } from '@/features/templates/findTemplate'
import { type DocumentInput, renderDocumentOrDefault } from '@/features/templates/templateBlocks'
import { formatCivilDate } from '@/lib/formatDate'
import type { CivilDate } from '@/types/civilDate'

const USE_LABELS = { residential: 'Residential', nonresidential: 'Nonresidential' } as const

export interface CertificateDetails {
  number: string
  issuedOn: CivilDate
  finalInspectionOn: CivilDate
  inspectorName: string
}

export async function certificateDocumentInput(
  db: DbOrTx,
  applicationId: string,
  details: CertificateDetails,
  signal: AbortSignal,
): Promise<{ input: DocumentInput; pins: readonly string[] } | null> {
  const data = await loadPermitData(db, applicationId, signal)
  if (data === null) return null
  const classification = data.application.facts.classification ?? null
  return {
    pins: data.application.pins.templates,
    input: {
      subtitle: details.number,
      frame: await documentFrame(db, {}, signal),
      context: {
        values: {
          ...mergeContextOf(data),
          'codeEdition.label': data.codeEdition === '' ? 'Not recorded' : data.codeEdition,
          'certificate.number': details.number,
          'certificate.issuedOn': formatCivilDate(details.issuedOn),
          'certificate.finalInspection': `${formatCivilDate(details.finalInspectionOn)}, ${details.inspectorName}`,
          'certificate.use': classification === null ? 'Not recorded' : USE_LABELS[classification],
        },
        conditions: data.conditions,
      },
    },
  }
}

export async function buildCertificatePdf(
  db: DbOrTx,
  applicationId: string,
  details: CertificateDetails,
  signal: AbortSignal,
): Promise<Uint8Array | null> {
  const built = await certificateDocumentInput(db, applicationId, details, signal)
  if (built === null) return null
  const template = await townTemplate(db, 'certificate', built.pins, signal)
  return await renderDocumentOrDefault('certificate', template, built.input)
}
