import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export interface TermHit {
  path: string
  line: number
}

const SKIPPED_DIRS = new Set(['node_modules', '.git', '.next'])
const DOCS_SITE_BUILD_OUTPUT = new Set([
  'docs-site/build',
  'docs-site/.docusaurus',
  'docs-site/.wrangler',
])
const BINARY_NUL = '\u0000'

function isSkipped(root: string, dir: string, name: string): boolean {
  if (SKIPPED_DIRS.has(name)) return true
  const relative = path.relative(root, dir).split(path.sep).join('/')
  return DOCS_SITE_BUILD_OUTPUT.has(relative)
}

export function collectFiles(root: string, dir: string = root): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!isSkipped(root, full, entry.name)) files.push(...collectFiles(root, full))
    } else if (entry.isFile()) {
      files.push(full)
    }
  }
  return files
}

export function findTermHits(files: string[], terms: string[]): TermHit[] {
  const needles = terms.map((t) => t.trim().toLowerCase()).filter((t) => t !== '')
  if (needles.length === 0) return []
  const hits: TermHit[] = []
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    if (text.includes(BINARY_NUL)) continue
    text.split('\n').forEach((line, index) => {
      const lower = line.toLowerCase()
      if (needles.some((needle) => lower.includes(needle))) {
        hits.push({ path: file, line: index + 1 })
      }
    })
  }
  return hits
}

export function formatHit(hit: TermHit, root: string = process.cwd()): string {
  return `${path.relative(root, hit.path)}:${hit.line}`
}

function main(): number {
  const termsFile = process.env.CHIBAN_TERMS_FILE
  if (termsFile === undefined || termsFile === '') {
    console.error('term-gate: CHIBAN_TERMS_FILE is not set, skipping')
    return 0
  }
  const terms = readFileSync(termsFile, 'utf8').split('\n')
  const root = path.resolve(process.argv[2] ?? process.cwd())
  const hits = findTermHits(collectFiles(root), terms)
  for (const hit of hits) process.stdout.write(`${formatHit(hit, root)}\n`)
  return hits.length === 0 ? 0 : 1
}

if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exit(main())
}
