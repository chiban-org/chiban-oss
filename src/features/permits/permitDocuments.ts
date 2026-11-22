import type { DbOrTx } from '@/db/client'
import { isBuildingPermit } from '@/features/packs/roles'
import { documentFrame } from '@/features/pdf/documentFrame'
import { loadPermitData, mergeContextOf, type PermitData } from '@/features/permits/permitData'
import { plumbingSignerOverride } from '@/features/permits/plumbingSigner'
import { townTemplate } from '@/features/templates/findTemplate'
import { type DocumentInput, renderDocumentOrDefault } from '@/features/templates/templateBlocks'
import { err, ok, type Result } from '@/types/result'

const NOT_RECORDED = 'Not recorded'

function contractorWithLicense(data: PermitData): string {
  return data.licenseNumber === ''
    ? data.contractorName
    : `${data.contractorName} (license ${data.licenseNumber})`
}

function codeEditionLabel(data: PermitData): string {
  if (!isBuildingPermit(data.application.typeBody.classification)) return ''
  return data.codeEdition === '' ? NOT_RECORDED : data.codeEdition
}

export async function permitDocumentInput(
  db: DbOrTx,
  data: PermitData,
  signal: AbortSignal,
): Promise<DocumentInput> {
  const frame = await documentFrame(db, {}, signal)
  return {
    title: data.application.typeBody.label,
    subtitle:
      data.correctionMark === null
        ? data.application.number
        : `${data.application.number} (${data.correctionMark})`,
    frame,
    context: {
      values: {
        ...mergeContextOf(data),
        'codeEdition.label': codeEditionLabel(data),
        'permit.contractorWithLicense': contractorWithLicense(data),
        'fees.status': data.feeStatus,
      },
      conditions: data.conditions,
      ...plumbingSignerOverride('permit', data.application.typeBody.classification, frame),
    },
  }
}

export async function buildPermitPdf(
  db: DbOrTx,
  applicationId: string,
  signal: AbortSignal,
): Promise<Result<Uint8Array, 'not_issued'>> {
  const data = await loadPermitData(db, applicationId, signal)
  if (data?.application.state !== 'issued') return err('not_issued')
  return ok(await renderPermit(db, data, signal))
}

export async function renderPermit(
  db: DbOrTx,
  data: PermitData,
  signal: AbortSignal,
): Promise<Uint8Array> {
  const input = await permitDocumentInput(db, data, signal)
  return await renderDocumentOrDefault('permit', data.permitTemplate, input)
}

export async function buildPlacardPdf(
  db: DbOrTx,
  applicationId: string,
  signal: AbortSignal,
): Promise<Result<Uint8Array, 'not_issued'>> {
  const data = await loadPermitData(db, applicationId, signal)
  if (data?.application.state !== 'issued') return err('not_issued')
  const input = await permitDocumentInput(db, data, signal)
  const template = await townTemplate(db, 'placard', data.application.pins.templates, signal)
  return ok(
    await renderDocumentOrDefault('placard', template, {
      frame: input.frame,
      context: input.context,
      title: data.application.typeBody.label.toUpperCase(),
      ...(data.correctionMark === null ? {} : { subtitle: data.correctionMark }),
    }),
  )
}
