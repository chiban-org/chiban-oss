import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { AppError, ErrorIds } from '@/constants/errorIds'

const CADDYFILE = fileURLToPath(new URL('../../deploy/Caddyfile', import.meta.url))
const MATCHER = /@anonymousIntake\s+path\s+([^\n]+)/
const RESOURCE_ATTRIBUTES =
  /<(?:img|script|source|link|video|audio|iframe|embed|object|input)\b[^>]*?\s(?:src|href|srcset|poster|data)="([^"]*)"/g
const STYLE_URL = /url\(\s*['"]?([^'")]+)['"]?\s*\)/g

export function logSkipPatterns(): string[] {
  const match = MATCHER.exec(readFileSync(CADDYFILE, 'utf8'))
  if (match?.[1] === undefined)
    throw new AppError(ErrorIds.CFG_MISSING, 'no @anonymousIntake matcher in the Caddyfile')
  return match[1].trim().split(/\s+/)
}

function matches(path: string, pattern: string): boolean {
  return pattern.endsWith('*') ? path.startsWith(pattern.slice(0, -1)) : path === pattern
}

export function isLogSkipped(path: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => matches(path, pattern))
}

function sameOriginPath(url: string): string | null {
  if (url === '' || url.startsWith('data:') || url.startsWith('#')) return null
  if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('//')) return null
  return (url.split(/[?#]/)[0] ?? '').split(/\s+/)[0] ?? null
}

export function requestedPaths(markup: string): string[] {
  const urls = [
    ...[...markup.matchAll(RESOURCE_ATTRIBUTES)].flatMap((m) =>
      (m[1] ?? '').split(',').map((part) => part.trim()),
    ),
    ...[...markup.matchAll(STYLE_URL)].map((m) => m[1] ?? ''),
  ]
  return urls.flatMap((url) => {
    const path = sameOriginPath(url)
    return path === null ? [] : [path]
  })
}

export function loggedRequests(markup: string): string[] {
  const patterns = logSkipPatterns()
  return requestedPaths(markup).filter((path) => !isLogSkipped(path, patterns))
}
