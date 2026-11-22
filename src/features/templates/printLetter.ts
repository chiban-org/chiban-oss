import type { Db, DbOrTx } from '@/db/client'
import { transactionResult } from '@/db/transactionResult'
import { hasFullRecordAccess } from '@/features/access/roles'
import { boardKindOf } from '@/features/applications/applicationTypeSchema'
import type { Actor } from '@/features/auth/actor'
import { attachDocument } from '@/features/documents/attach'
import type { DocKind } from '@/features/documents/types'
import { mayUploadTo } from '@/features/documents/uploadAccess'
import { storeGeneratedBytes } from '@/features/files/ingest'
import { documentFrame } from '@/features/pdf/documentFrame'
import { loadPermitData, mergeContextOf, type PermitData } from '@/features/permits/permitData'
import type { ObjectStore } from '@/features/storage/objectStore'
import { pinnedTemplatesOfKind } from '@/features/templates/findTemplate'
import { renderDocument } from '@/features/templates/templateBlocks'
import type { TemplateBody } from '@/features/templates/templateSchema'
import { err, ok, type Result } from '@/types/result'

export interface LetterChoice {
  key: string
  label: string
}

export type PrintLetterError = 'forbidden' | 'not_found' | 'unknown_letter' | 'letter_broken'

async function pinnedLetters(
  db: DbOrTx,
  data: PermitData,
  signal: AbortSignal,
): Promise<TemplateBody[]> {
  return await pinnedTemplatesOfKind(db, data.application.pins.templates, 'letter', signal)
}

export async function lettersFor(
  db: DbOrTx,
  applicationId: string,
  signal: AbortSignal,
): Promise<LetterChoice[]> {
  const data = await loadPermitData(db, applicationId, signal)
  if (data === null) return []
  const letters = await pinnedLetters(db, data, signal)
  return letters.map((t) => ({ key: t.key, label: t.label }))
}

export async function mayPrintLetters(
  db: DbOrTx,
  actor: Actor,
  applicationId: string,
  signal: AbortSignal,
): Promise<boolean> {
  return (
    hasFullRecordAccess(actor) &&
    (await mayUploadTo(db, actor, { kind: 'application', id: applicationId }, signal))
  )
}

function letterDocKind(data: PermitData): DocKind {
  return boardKindOf(data.application.typeBody.classification) === null
    ? 'attachment'
    : 'board_material'
}

async function renderLetter(
  db: DbOrTx,
  data: PermitData,
  template: TemplateBody,
  signal: AbortSignal,
): Promise<Result<Uint8Array, 'letter_broken'>> {
  const rendered = await renderDocument('letter', template, {
    title: template.label,
    subtitle: data.application.number,
    frame: await documentFrame(db, {}, signal),
    context: { values: mergeContextOf(data), conditions: data.conditions },
  })
  return rendered.ok ? ok(rendered.value) : err('letter_broken')
}

export async function printLetter(
  db: Db,
  actor: Actor,
  input: { applicationId: string; templateKey: string },
  store: ObjectStore,
  signal: AbortSignal,
): Promise<Result<{ documentId: string }, PrintLetterError>> {
  signal.throwIfAborted()
  if (!(await mayPrintLetters(db, actor, input.applicationId, signal))) return err('forbidden')
  const data = await loadPermitData(db, input.applicationId, signal)
  if (data === null) return err('not_found')
  const template = (await pinnedLetters(db, data, signal)).find((t) => t.key === input.templateKey)
  if (template === undefined) return err('unknown_letter')
  const pdf = await renderLetter(db, data, template, signal)
  if (!pdf.ok) return pdf
  return await transactionResult<{ documentId: string }, PrintLetterError>(db, async (tx) => {
    const stored = await storeGeneratedBytes(tx, store, pdf.value, 'application/pdf', signal)
    const attached = await attachDocument(
      tx,
      actor,
      {
        target: { kind: 'application', id: input.applicationId },
        title: template.label,
        docKind: letterDocKind(data),
        file: {
          sha256: stored.sha256,
          filename: `${data.application.number}-${template.key}.pdf`,
          contentType: 'application/pdf',
        },
        audiences: ['project_parties'],
        isPublic: false,
      },
      signal,
    )
    return ok({ documentId: attached.documentId })
  })
}
