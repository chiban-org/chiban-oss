import type { DbOrTx } from '@/db/client'
import { documentFrame } from '@/features/pdf/documentFrame'
import { renderPdf } from '@/features/pdf/renderPdf'
import { loadPermitData } from '@/features/permits/permitData'
import { formatCivilDate } from '@/lib/formatDate'
import type { CivilDate } from '@/types/civilDate'

const USE_LABELS = { residential: 'Residential', nonresidential: 'Nonresidential' } as const

export interface CertificateDetails {
  number: string
  issuedOn: CivilDate
  finalInspectionOn: CivilDate
  inspectorName: string
}

export async function buildCertificatePdf(
  db: DbOrTx,
  applicationId: string,
  details: CertificateDetails,
  signal: AbortSignal,
): Promise<Uint8Array | null> {
  const data = await loadPermitData(db, applicationId, signal)
  if (data === null) return null
  const classification = data.application.facts.classification ?? null
  return await renderPdf({
    title: 'Certificate of Occupancy',
    subtitle: details.number,
    frame: await documentFrame(db, {}, signal),
    scale: 'document',
    blocks: [
      {
        kind: 'paragraph',
        text: `${data.townName} certifies that the work under permit ${data.application.number} was inspected and the building may be occupied.`,
      },
      {
        kind: 'fields',
        rows: [
          { label: 'Certificate number', value: details.number },
          { label: 'Permit number', value: data.application.number },
          { label: 'Parcel', value: data.parcelDisplayId },
          { label: 'Site address', value: data.siteAddress },
          { label: 'Owner', value: data.ownerName },
          {
            label: 'Use',
            value: classification === null ? 'Not recorded' : USE_LABELS[classification],
          },
          { label: 'Issued', value: formatCivilDate(details.issuedOn) },
          {
            label: 'Final inspection',
            value: `${formatCivilDate(details.finalInspectionOn)}, ${details.inspectorName}`,
          },
          {
            label: 'Code edition',
            value: data.codeEdition === '' ? 'Not recorded' : data.codeEdition,
          },
        ],
      },
      ...(data.conditions.length === 0
        ? []
        : [
            { kind: 'heading' as const, text: 'Conditions' },
            {
              kind: 'table' as const,
              columns: ['Condition'],
              rows: data.conditions.map((c) => [c]),
            },
          ]),
      { kind: 'signature', role: 'building_official', label: 'Authorized signature' },
    ],
  })
}
