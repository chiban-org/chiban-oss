export type DiffKind = 'same' | 'removed' | 'added'

export interface DiffSegment {
  kind: DiffKind
  text: string
}

function tokens(text: string): string[] {
  return text.match(/\s+|\S+/g) ?? []
}

function lcsLengths(a: string[], b: string[]): (i: number, j: number) => number {
  const width = b.length + 1
  const table = new Uint32Array((a.length + 1) * width)
  const cell = (i: number, j: number) => table.at(i * width + j) ?? 0
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      const length =
        a.at(i) === b.at(j) ? cell(i + 1, j + 1) + 1 : Math.max(cell(i + 1, j), cell(i, j + 1))
      table.set([length], i * width + j)
    }
  }
  return cell
}

function push(out: DiffSegment[], kind: DiffKind, text: string): void {
  const last = out.at(-1)
  if (last !== undefined && last.kind === kind) last.text += text
  else out.push({ kind, text })
}

export function diffWords(before: string, after: string): DiffSegment[] {
  const a = tokens(before)
  const b = tokens(after)
  const lcs = lcsLengths(a, b)
  const out: DiffSegment[] = []
  let i = 0
  let j = 0
  let pendingRemoved = ''
  let pendingAdded = ''
  const flush = () => {
    if (pendingRemoved !== '') push(out, 'removed', pendingRemoved)
    if (pendingAdded !== '') push(out, 'added', pendingAdded)
    pendingRemoved = ''
    pendingAdded = ''
  }
  while (i < a.length || j < b.length) {
    const left = a.at(i)
    const right = b.at(j)
    if (left !== undefined && left === right) {
      flush()
      push(out, 'same', left)
      i += 1
      j += 1
    } else if (left !== undefined && (right === undefined || lcs(i + 1, j) >= lcs(i, j + 1))) {
      pendingRemoved += left
      i += 1
    } else {
      pendingAdded += right ?? ''
      j += 1
    }
  }
  flush()
  return out
}
