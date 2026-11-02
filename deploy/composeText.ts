import { readFileSync } from 'node:fs'

export function readDeployFile(name: string): string {
  return readFileSync(new URL(`./${name}`, import.meta.url), 'utf8')
}

function servicesBody(compose: string): string[] {
  const afterServices = compose.split(/^services:\n/m)[1] ?? ''
  return (afterServices.split(/^\S/m)[0] ?? '').split('\n')
}

export function serviceNames(compose: string): string[] {
  return servicesBody(compose)
    .map((line) => /^ {2}([a-z][a-z0-9-]*):$/.exec(line)?.[1])
    .filter((name): name is string => name !== undefined)
}

export function serviceBlock(compose: string, name: string): string {
  const lines = servicesBody(compose)
  const start = lines.indexOf(`  ${name}:`)
  if (start === -1) return ''
  const rest = lines.slice(start + 1)
  const end = rest.findIndex((line) => /^ {2}\S/.test(line))
  return (end === -1 ? rest : rest.slice(0, end)).join('\n')
}

export function envExampleValues(example: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const line of example.split('\n')) {
    const separator = line.indexOf('=')
    const key = line.slice(0, separator)
    if (separator > 0 && /^[A-Z][A-Z0-9_]*$/.test(key)) out.set(key, line.slice(separator + 1))
  }
  return out
}
