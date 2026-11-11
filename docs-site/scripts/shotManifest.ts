import path from 'node:path'

export interface Shot {
  file: string
  persona: string
  path: string
  width: number
  height: number
  open?: string[]
}

export class ManifestError extends Error {}

const SIGNED_OUT = 'Signed out'

export function needsSignIn(persona: string): boolean {
  return persona !== SIGNED_OUT
}

function fail(source: string, index: number, problem: string): never {
  throw new ManifestError(`${source}[${index}]: ${problem}`)
}

function text(source: string, index: number, record: Record<string, unknown>, key: string): string {
  const value = record[key]
  if (typeof value !== 'string' || value.trim() === '') fail(source, index, `${key} must be text`)
  return value
}

function size(source: string, index: number, record: Record<string, unknown>, key: string): number {
  const value = record[key]
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    fail(source, index, `${key} must be a whole number above zero`)
  }
  return value
}

function links(source: string, index: number, value: unknown): string[] {
  const list = Array.isArray(value) ? value : [value]
  const valid = list.every((item) => typeof item === 'string' && item.trim() !== '')
  if (list.length === 0 || !valid) fail(source, index, 'open must be text or a list of text')
  return list as string[]
}

export function parseManifest(source: string, json: unknown): Shot[] {
  if (!Array.isArray(json)) throw new ManifestError(`${source}: expected an array of shots`)
  const seen = new Set<string>()
  return json.map((entry: unknown, index) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      fail(source, index, 'expected an object')
    }
    const record = entry as Record<string, unknown>
    const file = text(source, index, record, 'file')
    if (!file.endsWith('.png') || path.isAbsolute(file) || file.split('/').includes('..')) {
      fail(source, index, 'file must be a relative .png path inside the shots folder')
    }
    if (seen.has(file)) fail(source, index, `file ${file} appears twice`)
    seen.add(file)
    const shotPath = text(source, index, record, 'path')
    if (!shotPath.startsWith('/') || shotPath.startsWith('//')) {
      fail(source, index, 'path must start with a single /')
    }
    const shot: Shot = {
      file,
      persona: text(source, index, record, 'persona'),
      path: shotPath,
      width: size(source, index, record, 'width'),
      height: size(source, index, record, 'height'),
    }
    if (record.open !== undefined) shot.open = links(source, index, record.open)
    return shot
  })
}

export function groupByPersona(shots: readonly Shot[]): Map<string, Shot[]> {
  const groups = new Map<string, Shot[]>()
  for (const shot of shots) {
    groups.set(shot.persona, [...(groups.get(shot.persona) ?? []), shot])
  }
  return groups
}

export function outputPath(imagesRoot: string, shot: Shot): string {
  return path.join(imagesRoot, shot.file)
}
