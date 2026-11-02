import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const TELEMETRY = /sentry|posthog|analytics|datadog|newrelic|bugsnag|rollbar|opentelemetry/i

describe('telemetry', () => {
  it('no error reporting or analytics package is installed', () => {
    const pkg = JSON.parse(
      readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
    ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
    const names = [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ]
    expect(names.filter((name) => TELEMETRY.test(name))).toEqual([])
  })
})
