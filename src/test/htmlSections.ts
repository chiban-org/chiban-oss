const OPEN_OR_CLOSE = /<section\b[^>]*>|<\/section>/g
const OPENING = /<section\b[^>]*>/g

function openings(html: string, label: string): number[] {
  const wanted = `aria-label="${label}"`
  return [...html.matchAll(OPENING)].filter((m) => m[0].includes(wanted)).map((m) => m.index)
}

export function sectionOf(html: string, label: string): string | null {
  const start = openings(html, label)[0]
  if (start === undefined) return null
  OPEN_OR_CLOSE.lastIndex = start
  let depth = 0
  for (let match = OPEN_OR_CLOSE.exec(html); match !== null; match = OPEN_OR_CLOSE.exec(html)) {
    depth += match[0].startsWith('</') ? -1 : 1
    if (depth === 0) return html.slice(start, match.index + match[0].length)
  }
  return html.slice(start)
}

export function countSections(html: string, label: string): number {
  return openings(html, label).length
}

export function filledButtons(html: string): string[] {
  return [...html.matchAll(/<button[^>]*data-variant="default"[^>]*>([^<]*)<\/button>/g)].map(
    (m) => m[1] ?? '',
  )
}
