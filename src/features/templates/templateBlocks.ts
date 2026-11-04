import { AppError, ErrorIds } from '@/constants/errorIds'
import type { DocumentFrame } from '@/features/pdf/frame'
import { type PdfBlock, renderPdf } from '@/features/pdf/renderPdf'
import {
  type DocRenderContext,
  docToBlocks,
  textParagraphs,
} from '@/features/templates/doc/docToBlocks'
import { frameMergeContext } from '@/features/templates/frameFields'
import { documentKind, textSuffix } from '@/features/templates/kinds/documentKinds'
import { renderTemplateText } from '@/features/templates/renderTemplate'
import {
  isDocTemplate,
  type TemplateBody,
  type TemplateKind,
} from '@/features/templates/templateSchema'
import { err, ok, type Result } from '@/types/result'

export interface DocumentInput {
  title?: string
  subtitle?: string
  frame: DocumentFrame
  context: DocRenderContext
}

export type BlocksError = { unknownFields: string[] }

export function templateBlocks(
  kind: TemplateKind,
  template: TemplateBody | null,
  context: DocRenderContext,
): Result<PdfBlock[], BlocksError> {
  if (template === null) return ok(docToBlocks(documentKind(kind).defaultDoc, context))
  if (isDocTemplate(template)) return ok(docToBlocks(template.doc, context))
  const text = renderTemplateText(template.body, context.values)
  if (!text.ok) return err(text.error)
  const suffix = docToBlocks({ type: 'doc', content: [...textSuffix(kind)] }, context)
  return ok([...textParagraphs(text.value), ...suffix])
}

export function withFrameFields(input: DocumentInput): DocRenderContext {
  return {
    ...input.context,
    values: { ...input.context.values, ...frameMergeContext(input.frame) },
  }
}

export function documentTitle(
  kind: TemplateKind,
  template: TemplateBody | null,
  input: DocumentInput,
): string {
  return input.title ?? template?.label ?? documentKind(kind).title
}

export async function renderDocument(
  kind: TemplateKind,
  template: TemplateBody | null,
  input: DocumentInput,
): Promise<Result<Uint8Array, BlocksError>> {
  const blocks = templateBlocks(kind, template, withFrameFields(input))
  if (!blocks.ok) return blocks
  return ok(
    await renderPdf({
      title: documentTitle(kind, template, input),
      ...(input.subtitle === undefined ? {} : { subtitle: input.subtitle }),
      frame: input.frame,
      scale: documentKind(kind).scale,
      blocks: blocks.value,
    }),
  )
}

export async function renderDocumentOrDefault(
  kind: TemplateKind,
  template: TemplateBody | null,
  input: DocumentInput,
): Promise<Uint8Array> {
  const rendered = await renderDocument(kind, template, input)
  if (rendered.ok) return rendered.value
  const fallback = await renderDocument(kind, null, input)
  if (fallback.ok) return fallback.value
  throw new AppError(ErrorIds.PDF_DEFAULT_TEMPLATE_BROKEN, 'A default template did not render', {
    kind,
  })
}
