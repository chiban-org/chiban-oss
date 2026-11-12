import type { Wording } from '@/features/notifications/wording/wordingDefaults'
import type { WordingValues } from '@/features/notifications/wording/wordingFields'
import { isWordingField } from '@/features/notifications/wording/wordingFields'
import { scanTokens } from '@/features/templates/mergeFields'
import { escapeHtml } from '@/features/templates/renderTemplate'

export interface WordingLink {
  href: string
  label: string
  note?: string
}

export interface RenderedMessage {
  subject: string
  text: string
  html: string
}

const LINK = 'link'

interface Piece {
  literal: string
  field: string | null
}

function piecesOf(source: string): Piece[] {
  const pieces: Piece[] = []
  let cursor = 0
  for (const token of scanTokens(source)) {
    pieces.push({ literal: source.slice(cursor, token.start), field: token.name })
    cursor = token.end
  }
  pieces.push({ literal: source.slice(cursor), field: null })
  return pieces
}

function valueOf(field: string, values: WordingValues): string {
  return isWordingField(field) ? (new Map(Object.entries(values)).get(field) ?? '') : ''
}

function emptyOfValues(pieces: Piece[], values: WordingValues, href: string): boolean {
  const fields = pieces.flatMap((p) => (p.field === null ? [] : [p.field]))
  return (
    fields.length > 0 && fields.every((f) => (f === LINK ? href : valueOf(f, values)).trim() === '')
  )
}

function asText(pieces: Piece[], values: WordingValues, href: string): string {
  return pieces
    .map(
      (p) =>
        p.literal + (p.field === null ? '' : p.field === LINK ? href : valueOf(p.field, values)),
    )
    .join('')
}

function asHtml(pieces: Piece[], values: WordingValues, href: string): string {
  const anchor = `<a href="${escapeHtml(href)}">${escapeHtml(href)}</a>`
  return pieces
    .map((p) => {
      const literal = escapeHtml(p.literal).replace(/\n/g, '<br>')
      if (p.field === null) return literal
      return literal + (p.field === LINK ? anchor : escapeHtml(valueOf(p.field, values)))
    })
    .join('')
}

export function renderSubject(subject: string, values: WordingValues): string {
  return asText(piecesOf(subject), values, '').replace(/\s+/g, ' ').trim()
}

export function usesLink(source: string): boolean {
  return scanTokens(source).some((t) => t.name === LINK)
}

export function renderWording(
  wording: Wording,
  values: WordingValues,
  link: WordingLink | null,
): RenderedMessage {
  const href = link?.href ?? ''
  const appended = href !== '' && !usesLink(wording.body)
  const paragraphs = wording.body
    .split(/\n\s*\n/)
    .map((p) => piecesOf(p.trim()))
    .filter((pieces) => asText(pieces, values, href).trim() !== '')
    .filter((pieces) => !emptyOfValues(pieces, values, href))
  const notes = link?.note === undefined ? [] : [piecesOf(link.note)]
  const all = [...paragraphs, ...notes]
  const text = all.map((p) => asText(p, values, href)).join('\n\n')
  const html = all.map((p) => `<p>${asHtml(p, values, href)}</p>`).join('')
  return {
    subject: renderSubject(wording.subject, values),
    text: appended ? `${text}\n\n${href}\n` : `${text}\n`,
    html: appended
      ? `${html}<p><a href="${escapeHtml(href)}">${escapeHtml(link?.label ?? href)}</a></p>`
      : html,
  }
}
