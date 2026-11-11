import { afterEach, describe, expect, it, vi } from 'vitest'
import { log, setLogLevel } from '@/server/log'

function capture() {
  const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  const errOut = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  return {
    out: () => out.mock.calls.map((c) => String(c[0])),
    err: () => errOut.mock.calls.map((c) => String(c[0])),
  }
}

afterEach(() => {
  setLogLevel('info')
  vi.restoreAllMocks()
})

describe('log', () => {
  it('writes info and above at the default level, info to stdout and problems to stderr', () => {
    const seen = capture()
    log.debug('[test] detail')
    log.info('[test] started')
    log.warn('[test] slow')
    log.error('[test] failed')
    expect(seen.out()).toEqual(['[test] started\n'])
    expect(seen.err()).toEqual(['[test] slow\n', '[test] failed\n'])
  })

  it('drops lines below the configured level', () => {
    setLogLevel('error')
    const seen = capture()
    log.info('[test] started')
    log.warn('[test] slow')
    log.error('[test] failed')
    expect(seen.out()).toEqual([])
    expect(seen.err()).toEqual(['[test] failed\n'])
  })

  it('writes debug lines when the level is debug', () => {
    setLogLevel('debug')
    const seen = capture()
    log.debug('[test] detail')
    expect(seen.out()).toEqual(['[test] detail\n'])
  })

  it('joins extra parts, using the message of an error and JSON for other values', () => {
    const seen = capture()
    log.error('[test] send failed', new Error('connection refused'), { attempt: 2 })
    expect(seen.err()).toEqual(['[test] send failed connection refused {"attempt":2}\n'])
  })
})
