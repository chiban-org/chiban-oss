import type { PdfBlock } from '@/features/pdf/pdfSpec'

function rowsKey(prefix: string, i: number): string {
  return `${prefix}-${i}`
}

function BlockPreview({ block }: { block: PdfBlock }) {
  switch (block.kind) {
    case 'heading':
      return <p className="m-0 font-serif text-base font-semibold">{block.text}</p>
    case 'paragraph':
    case 'notice':
      return <p className="m-0">{block.text}</p>
    case 'text':
      return <p className="m-0">{block.runs.map((r) => r.text).join('')}</p>
    case 'list':
      return (
        <ul className="m-0 list-none p-0">
          {block.items.map((item, i) => (
            <li
              key={rowsKey('item', i)}
            >{`${item.marker} ${item.runs.map((r) => r.text).join('')}`}</li>
          ))}
        </ul>
      )
    case 'fields':
      return (
        <dl className="m-0 grid grid-cols-[8rem_1fr] gap-x-3">
          {block.rows.map((row, i) => (
            <div key={rowsKey('row', i)} className="contents">
              <dt className="text-xs font-bold text-muted-foreground">{row.label}</dt>
              <dd className="m-0">{row.value}</dd>
            </div>
          ))}
        </dl>
      )
    case 'table':
      return (
        <table className="w-full text-xs">
          <thead>
            <tr>
              {block.columns.map((c) => (
                <th key={c} className="text-left">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, i) => (
              <tr key={rowsKey('tr', i)}>
                {row.map((cell, n) => (
                  <td key={rowsKey('td', n)}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )
    case 'signature':
      return <p className="m-0">{block.person?.name ?? block.label}</p>
  }
}

export function BlocksPreview({ blocks }: { blocks: readonly PdfBlock[] }) {
  if (blocks.length === 0) {
    return <p className="m-0 text-muted-foreground">Nothing to print for this record.</p>
  }
  return (
    <div className="grid gap-1">
      {blocks.map((block, i) => (
        <BlockPreview key={rowsKey('block', i)} block={block} />
      ))}
    </div>
  )
}
