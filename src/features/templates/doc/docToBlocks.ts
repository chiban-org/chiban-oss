import type { PdfBlock, PdfListItem, SignaturePerson, TextRun } from '@/features/pdf/pdfSpec'
import {
  type DocNode,
  fieldTableRows,
  stringAttr,
  type TemplateDoc,
} from '@/features/templates/doc/docSchema'
import { lockedSource } from '@/features/templates/doc/lockedSources'
import { signatureLabel } from '@/features/templates/doc/signatureLabels'
import { isMergeField } from '@/features/templates/mergeFields'
import { type MergeContext, mergeValue } from '@/features/templates/renderTemplate'
import { type SignerRole, SignerRoleSchema } from '@/features/town/profileSchema'

export interface DocRenderContext {
  values: MergeContext
  sections?: ReadonlyMap<string, PdfBlock[]>
  locked?: ReadonlyMap<string, string>
  conditions?: readonly string[]
  people?: ReadonlyMap<SignerRole, SignaturePerson>
}

const DATA_NODES: ReadonlySet<string> = new Set(['conditionsList', 'lockedBlock', 'recordSection'])

function markFlags(node: DocNode): Omit<TextRun, 'text'> {
  const types = new Set((node.marks ?? []).map((m) => m.type))
  return {
    ...(types.has('bold') ? { bold: true } : {}),
    ...(types.has('italic') ? { italic: true } : {}),
  }
}

function runOf(node: DocNode, ctx: DocRenderContext): TextRun | null {
  if (node.type === 'text') return { text: node.text ?? '', ...markFlags(node) }
  if (node.type === 'hardBreak') return { text: '\n' }
  if (node.type !== 'mergeField') return null
  return { text: mergeValue(stringAttr(node, 'name'), ctx.values), ...markFlags(node) }
}

const sameMarks = (a: TextRun, b: TextRun) => a.bold === b.bold && a.italic === b.italic

export function runsOf(nodes: readonly DocNode[], ctx: DocRenderContext): TextRun[] {
  const runs: TextRun[] = []
  for (const node of nodes) {
    const run = runOf(node, ctx)
    if (run === null || run.text === '') continue
    const last = runs.at(-1)
    if (last !== undefined && sameMarks(last, run)) last.text += run.text
    else runs.push(run)
  }
  return runs
}

const plainText = (runs: TextRun[]) => runs.map((r) => r.text).join('')

export function textParagraphs(text: string): PdfBlock[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p !== '')
    .map((p) => ({ kind: 'paragraph', text: p }))
}

function paragraphBlocks(node: DocNode, ctx: DocRenderContext): PdfBlock[] {
  const runs = runsOf(node.content ?? [], ctx)
  const rich =
    runs.some((r) => r.bold === true || r.italic === true) ||
    (node.content ?? []).some((n) => n.type === 'hardBreak')
  if (!rich) return textParagraphs(plainText(runs))
  return plainText(runs).trim() === '' ? [] : [{ kind: 'text', runs }]
}

function listItems(node: DocNode, depth: number, ctx: DocRenderContext): PdfListItem[] {
  const ordered = node.type === 'orderedList'
  const startAt = node.attrs?.start
  let number = typeof startAt === 'number' ? startAt : 1
  const items: PdfListItem[] = []
  for (const item of node.content ?? []) {
    let marker = ordered ? `${number}.` : '•'
    for (const child of item.content ?? []) {
      if (child.type === 'bulletList' || child.type === 'orderedList') {
        items.push(...listItems(child, depth + 1, ctx))
        continue
      }
      items.push({ marker, depth, runs: runsOf(child.content ?? [], ctx) })
      marker = ''
    }
    number += 1
  }
  return items
}

function lockedBlocks(node: DocNode, ctx: DocRenderContext): PdfBlock[] {
  const source = stringAttr(node, 'source')
  const text = (ctx.locked?.get(source) ?? '').trim()
  if (text === '') return []
  return lockedSource(source)?.style === 'notice'
    ? [{ kind: 'notice', text }]
    : textParagraphs(text)
}

function signatureBlocks(node: DocNode, ctx: DocRenderContext): PdfBlock[] {
  const role = SignerRoleSchema.safeParse(node.attrs?.role)
  if (!role.success) return []
  const person = ctx.people?.get(role.data)
  return [
    {
      kind: 'signature',
      role: role.data,
      label: signatureLabel(role.data),
      ...(person === undefined ? {} : { person }),
    },
  ]
}

function conditionBlocks(_node: DocNode, ctx: DocRenderContext): PdfBlock[] {
  const conditions = ctx.conditions ?? []
  if (conditions.length === 0) return []
  return [{ kind: 'table', columns: ['Condition'], rows: conditions.map((c) => [c]) }]
}

function sectionBlocks(node: DocNode, ctx: DocRenderContext): PdfBlock[] {
  return ctx.sections?.get(stringAttr(node, 'name')) ?? []
}

type Converter = (node: DocNode, ctx: DocRenderContext) => PdfBlock[]

const DATA_CONVERTERS: ReadonlyMap<string, Converter> = new Map([
  ['conditionsList', conditionBlocks],
  ['lockedBlock', lockedBlocks],
  ['recordSection', sectionBlocks],
])

function dataBlocks(node: DocNode, ctx: DocRenderContext): PdfBlock[] {
  return DATA_CONVERTERS.get(node.type)?.(node, ctx) ?? []
}

function rawValue(name: string, values: MergeContext): string {
  return isMergeField(name) ? (values[name] ?? '') : ''
}

function fieldBlocks(node: DocNode, ctx: DocRenderContext): PdfBlock[] {
  const rows = fieldTableRows(node).map((row) => ({
    label: row.label,
    value: rawValue(row.field, ctx.values),
  }))
  return rows.length === 0 ? [] : [{ kind: 'fields', rows }]
}

function oneLine(node: DocNode, ctx: DocRenderContext): string {
  return plainText(runsOf(node.content ?? [], ctx))
    .replace(/\s+/g, ' ')
    .trim()
}

function headingBlocks(node: DocNode, ctx: DocRenderContext): PdfBlock[] {
  const text = oneLine(node, ctx)
  return text === '' ? [] : [{ kind: 'heading', text }]
}

function listBlocks(node: DocNode, ctx: DocRenderContext): PdfBlock[] {
  const items = listItems(node, 0, ctx)
  return items.length === 0 ? [] : [{ kind: 'list', items }]
}

function noticeBlocks(node: DocNode, ctx: DocRenderContext): PdfBlock[] {
  const text = oneLine(node, ctx)
  return text === '' ? [] : [{ kind: 'notice', text }]
}

const CONVERTERS: ReadonlyMap<string, Converter> = new Map([
  ...DATA_CONVERTERS,
  ['paragraph', paragraphBlocks],
  ['heading', headingBlocks],
  ['bulletList', listBlocks],
  ['orderedList', listBlocks],
  ['noticeBox', noticeBlocks],
  ['fieldTable', fieldBlocks],
  ['signature', signatureBlocks],
])

export function nodeBlocks(node: DocNode, ctx: DocRenderContext): PdfBlock[] {
  return CONVERTERS.get(node.type)?.(node, ctx) ?? []
}

function headingIsOrphan(next: DocNode | undefined, ctx: DocRenderContext): boolean {
  return next !== undefined && DATA_NODES.has(next.type) && dataBlocks(next, ctx).length === 0
}

export function docToBlocks(doc: TemplateDoc, ctx: DocRenderContext): PdfBlock[] {
  return doc.content.flatMap((node, i) =>
    node.type === 'heading' && headingIsOrphan(doc.content[i + 1], ctx)
      ? []
      : nodeBlocks(node, ctx),
  )
}
