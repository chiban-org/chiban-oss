import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { generatedPages } from './pages'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))

for (const page of generatedPages()) {
  const target = path.join(ROOT, page.path)
  mkdirSync(path.dirname(target), { recursive: true })
  writeFileSync(target, page.render(), 'utf8')
  process.stdout.write(`wrote ${page.path}\n`)
}
