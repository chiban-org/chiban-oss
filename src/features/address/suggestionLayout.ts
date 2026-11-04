export interface AddressSuggestion {
  lines: string[]
  matches: boolean
}

export function toSingleLine(lines: readonly string[]): string {
  return lines.join(', ')
}

export function toTextBlock(lines: readonly string[]): string {
  return lines.join('\n')
}

export function fitLines(lines: readonly string[], max: number): string[] {
  if (lines.length <= max) return [...lines]
  const folded = lines.length - max + 1
  return [lines.slice(0, folded).join(', '), ...lines.slice(folded)]
}
