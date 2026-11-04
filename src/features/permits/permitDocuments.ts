import type { Db, DbOrTx } from '@/db/client'
import { documentFrame } from '@/features/pdf/documentFrame'
import type { DocumentFrame } from '@/features/pdf/frame'
import type { PdfBlock } from '@/features/pdf/renderPdf'
import { renderPdf } from '@/features/pdf/renderPdf'
import { loadPermitData, mergeContextOf, type PermitData } from '@/features/permits/permitData'
import { frameMergeContext } from '@/features/templates/frameFields'
import { renderTemplateText } from '@/features/templates/renderTemplate'
import { err, ok, type Result } from '@/types/result'

const PLACARD_NOTICE =
  'Post this placard where it can be seen from the street until the final inspection.'

function templateParagraphs(data: PermitData, frame: DocumentFrame): PdfBlock[] {
  if (data.permitTemplate === null) return []
  const rendered = renderTemplateText(data.permitTemplate.body, {
    ...mergeContextOf(data),
    ...frameMergeContext(frame),
  })
  if (!rendered.ok) return []
  return rendered.value
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p !== '')
    .map((text) => ({ kind: 'paragraph', text }))
}

function conditionsBlock(data: PermitData): PdfBlock[] {
  return data.conditions.length === 0
    ? []
    : [
        { kind: 'heading', text: 'Conditions' },
        { kind: 'table', columns: ['Condition'], rows: data.conditions.map((c) => [c]) },
      ]
}

export async function buildPermitPdf(
  db: DbOrTx,
  applicationId: string,
  signal: AbortSignal,
): Promise<Result<Uint8Array, 'not_issued'>> {
  const data = await loadPermitData(db, applicationId, signal)
  if (data?.application.state !== 'issued') return err('not_issued')
  const frame = await documentFrame(db, {}, signal)
  const contractor =
    data.licenseNumber === ''
      ? data.contractorName
      : `${data.contractorName} (license ${data.licenseNumber})`
  return ok(
    await renderPdf({
      title: data.application.typeBody.label,
      subtitle: data.application.number,
      frame,
      scale: 'document',
      blocks: [
        ...templateParagraphs(data, frame),
        {
          kind: 'fields',
          rows: [
            { label: 'Number', value: data.application.number },
            { label: 'Type', value: data.application.typeBody.label },
            { label: 'Parcel', value: data.parcelDisplayId },
            { label: 'Site address', value: data.siteAddress },
            { label: 'Owner', value: data.ownerName },
            { label: 'Contractor', value: contractor },
            { label: 'Issued', value: data.issuedOn },
            { label: 'Expires', value: data.expiresOn },
            {
              label: 'Code edition',
              value: data.codeEdition === '' ? 'Not recorded' : data.codeEdition,
            },
            { label: 'Fees', value: data.feeStatus },
          ],
        },
        ...conditionsBlock(data),
        { kind: 'signature', role: 'building_official', label: 'Authorized signature' },
      ],
    }),
  )
}

export async function buildPlacardPdf(
  db: Db,
  applicationId: string,
  signal: AbortSignal,
): Promise<Result<Uint8Array, 'not_issued'>> {
  const data = await loadPermitData(db, applicationId, signal)
  if (data?.application.state !== 'issued') return err('not_issued')
  return ok(
    await renderPdf({
      title: data.application.typeBody.label.toUpperCase(),
      frame: await documentFrame(db, {}, signal),
      scale: 'placard',
      blocks: [
        {
          kind: 'fields',
          rows: [
            { label: 'Number', value: data.application.number },
            { label: 'Site address', value: data.siteAddress },
            { label: 'Contractor', value: data.contractorName },
            { label: 'Issued', value: data.issuedOn },
            { label: 'Expires', value: data.expiresOn },
          ],
        },
        { kind: 'notice', text: PLACARD_NOTICE },
      ],
    }),
  )
}
