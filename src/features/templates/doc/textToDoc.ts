import type { DocNode, TemplateDoc } from '@/features/templates/doc/docSchema'
import { scanTokens } from '@/features/templates/mergeFields'

function inlineText(text: string): DocNode[] {
  return text.split('\n').flatMap((line, i): DocNode[] => {
    const parts: DocNode[] = i === 0 ? [] : [{ type: 'hardBreak' }]
    return line === '' ? parts : [...parts, { type: 'text', text: line }]
  })
}

export function inlineNodes(text: string): DocNode[] {
  const nodes: DocNode[] = []
  let cursor = 0
  for (const token of scanTokens(text)) {
    nodes.push(...inlineText(text.slice(cursor, token.start)))
    nodes.push({ type: 'mergeField', attrs: { name: token.name } })
    cursor = token.end
  }
  nodes.push(...inlineText(text.slice(cursor)))
  return nodes
}

function soleToken(paragraph: string): string | null {
  const tokens = scanTokens(paragraph)
  const [token] = tokens
  if (tokens.length !== 1 || token === undefined) return null
  return token.start === 0 && token.end === paragraph.length ? token.name : null
}

export function textToDoc(
  body: string,
  options: { lockedSources?: readonly string[]; suffix?: readonly DocNode[] } = {},
): TemplateDoc {
  const locked = new Set(options.lockedSources ?? [])
  const paragraphs = body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p !== '')
    .map((paragraph): DocNode => {
      const token = soleToken(paragraph)
      if (token !== null && locked.has(token)) {
        return { type: 'lockedBlock', attrs: { source: token } }
      }
      return { type: 'paragraph', content: inlineNodes(paragraph) }
    })
  const content = [...paragraphs, ...(options.suffix ?? [])]
  return { type: 'doc', content: content.length === 0 ? [{ type: 'paragraph' }] : content }
}
