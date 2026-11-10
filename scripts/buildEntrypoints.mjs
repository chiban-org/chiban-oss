import { cpSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { build } from 'esbuild'

const root = path.resolve(import.meta.dirname, '..')
const entryDir = path.join(root, 'src', 'entrypoints')
const outDir = path.resolve(process.argv[2] ?? path.join(root, 'dist'))

const kebab = (name) => name.replaceAll(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()

const names = readdirSync(entryDir)
  .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
  .map((file) => file.slice(0, -'.ts'.length))

await build({
  entryPoints: Object.fromEntries(names.map((n) => [kebab(n), path.join(entryDir, `${n}.ts`)])),
  outdir: outDir,
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  target: 'node22',
  tsconfig: path.join(root, 'tsconfig.json'),
  logLevel: 'info',
})

cpSync(path.join(root, 'src', 'features', 'demo', 'fixtures'), path.join(outDir, 'fixtures'), {
  recursive: true,
})
