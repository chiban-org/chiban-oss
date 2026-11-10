import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { prepareDemoOverlay } from '@/features/demo/overlay/overlayFromEnv'

const dir = mkdtempSync(path.join(tmpdir(), 'demo-overlay-'))

function file(name: string, content: string): string {
  const target = path.join(dir, name)
  writeFileSync(target, content)
  return target
}

async function prepare(target: string | undefined, demoMode = true) {
  const lines: string[] = []
  const result = await prepareDemoOverlay({
    file: target,
    demoMode,
    report: (line) => lines.push(line),
  })
  return { result, lines }
}

describe('prepareDemoOverlay', () => {
  it('does nothing when the setting is unset', async () => {
    expect(await prepare(undefined)).toEqual({ result: { ok: true, value: undefined }, lines: [] })
  })

  it('ignores the file, and says so, when demo mode is off', async () => {
    const target = file('off.json', '{')
    const { result, lines } = await prepare(target, false)
    expect(result).toEqual({ ok: true, value: undefined })
    expect(lines).toEqual([`demo overlay: ignoring ${target} because CHIBAN_DEMO_MODE is off`])
  })

  it('refuses a file that is not JSON, naming the file', async () => {
    const target = file('broken.json', '{"version": 1,')
    const { result } = await prepare(target)
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toContain(`demo overlay ${target} is invalid:`)
  })

  it('refuses an overlay the validators refuse, listing each path', async () => {
    const target = file(
      'bad.json',
      JSON.stringify({
        version: 1,
        starters: ['BP'],
        applicationTypes: { BP: { fees: { building: { expr: { op: 'flat', cents: 1.5 } } } } },
        townProfile: { email: 'not an email' },
      }),
    )
    const { result } = await prepare(target)
    expect(!result.ok && result.error.split('\n').slice(1)).toEqual([
      '  townProfile.email: Enter an email address like clerk@town.gov.',
      expect.stringMatching(/^ {2}applicationTypes\.BP\.fees\.building\.expr\.cents: /),
    ])
  })

  it('reports starters this build lacks and still returns the overlay', async () => {
    const target = file('ahead.json', JSON.stringify({ version: 1, starters: ['BP', 'QQ'] }))
    const { result, lines } = await prepare(target)
    expect(result).toEqual({ ok: true, value: { version: 1, starters: ['BP', 'QQ'] } })
    expect(lines).toEqual([
      'demo overlay: starter QQ is not installed in this build, so it is skipped',
    ])
  })
})
