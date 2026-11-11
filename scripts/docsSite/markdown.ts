export function escapeText(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

export function code(text: string): string {
  return `\`${text}\``
}

function cell(text: string): string {
  return text.replaceAll('\n', ' ').replaceAll('|', '\\|')
}

export function table(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  const head = `| ${headers.map(cell).join(' | ')} |`
  const rule = `| ${headers.map(() => '---').join(' | ')} |`
  const body = rows.map((row) => `| ${row.map(cell).join(' | ')} |`)
  return [head, rule, ...body].join('\n')
}

export function joinBlocks(blocks: readonly string[]): string {
  return `${blocks.filter((b) => b !== '').join('\n\n')}\n`
}

export function listInWords(items: readonly string[], conjunction = 'and'): string {
  if (items.length <= 1) return items.join('')
  if (items.length === 2) return `${items[0]} ${conjunction} ${items[1]}`
  return `${items.slice(0, -1).join(', ')} ${conjunction} ${items.at(-1)}`
}
