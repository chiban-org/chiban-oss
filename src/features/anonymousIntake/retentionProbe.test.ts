import { describe, expect, it } from 'vitest'
import {
  type ProbeDeps,
  type ProbeMarkers,
  runRetentionProbe,
} from '@/features/anonymousIntake/retentionProbe'

const signal = new AbortController().signal
const markers: ProbeMarkers = {
  clientIp: '203.0.113.7',
  userAgent: 'probe-ua-1234',
  filename: 'probe-name-1234.jpg',
  exifArtist: 'probe-artist-1234',
  sessionUserId: 'probe-user-1234',
  sessionEmail: 'probe-1234@example.test',
}

function clean(overrides: Partial<ProbeDeps> = {}): ProbeDeps & { purged: string[] } {
  const purged: string[] = []
  return {
    purged,
    submit: () => Promise.resolve({ status: 303 }),
    dumpDatabase: () => Promise.resolve('insert into complaints values (1, anonymous)'),
    readLogs: () => Promise.resolve('GET / 200\nanonymous_intake_failed E_ANON_001'),
    listObjects: () =>
      Promise.resolve([
        {
          key: 'blobs/sha256/ab/cd/abcd',
          metadata: {},
          contentDisposition: null,
          bytes: new Uint8Array([1, 2, 3]),
        },
      ]),
    readBackup: () =>
      Promise.resolve({
        database: 'insert into complaints values (1, anonymous)',
        objects: [{ key: 'blobs/sha256/ab/cd/abcd', metadata: {} }],
      }),
    purge: (token) => {
      purged.push(token)
      return Promise.resolve()
    },
    ...overrides,
  }
}

describe('runRetentionProbe', () => {
  it('clean inputs pass', async () => {
    const report = await runRetentionProbe(clean(), markers, signal)
    expect(report).toEqual({ passed: true, findings: [], submitStatus: 303 })
  })

  it('ip in a log line is a logs finding without the ip in the report', async () => {
    const report = await runRetentionProbe(
      clean({ readLogs: () => Promise.resolve(`{"remote_ip":"${markers.clientIp}"}`) }),
      markers,
      signal,
    )
    expect(report.passed).toBe(false)
    expect(report.findings).toEqual([{ location: 'logs', marker: 'clientIp' }])
    expect(JSON.stringify(report)).not.toContain(markers.clientIp)
  })

  it('an address that only starts with the probe address is not a match', async () => {
    const report = await runRetentionProbe(
      clean({ readLogs: () => Promise.resolve('remote_ip 203.0.113.77 and 9203.0.113.7') }),
      markers,
      signal,
    )
    expect(report.passed).toBe(true)
  })

  it('missing backup fails the probe', async () => {
    const report = await runRetentionProbe(
      clean({ readBackup: () => Promise.resolve(null) }),
      markers,
      signal,
    )
    expect(report.passed).toBe(false)
    expect(report.findings).toEqual([{ location: 'backup_missing', marker: null }])
  })

  it('markers in the database, object metadata, object bytes, and backup are located', async () => {
    const report = await runRetentionProbe(
      clean({
        dumpDatabase: () => Promise.resolve(`row ${markers.sessionUserId}`),
        listObjects: () =>
          Promise.resolve([
            {
              key: 'blobs/x',
              metadata: { 'original-name': markers.filename },
              contentDisposition: null,
              bytes: new TextEncoder().encode(`xx ${markers.exifArtist} yy`),
            },
          ]),
        readBackup: () =>
          Promise.resolve({
            database: `row ${markers.sessionEmail}`,
            objects: [{ key: `blobs/${markers.userAgent}`, metadata: {} }],
          }),
      }),
      markers,
      signal,
    )
    expect(report.findings).toEqual(
      expect.arrayContaining([
        { location: 'database', marker: 'sessionUserId' },
        { location: 'object_metadata', marker: 'filename' },
        { location: 'object_bytes', marker: 'exifArtist' },
        { location: 'backup_database', marker: 'sessionEmail' },
        { location: 'backup_objects', marker: 'userAgent' },
      ]),
    )
    expect(report.findings).toHaveLength(5)
  })

  it('a content disposition that names the file is an object_metadata finding', async () => {
    const report = await runRetentionProbe(
      clean({
        listObjects: () =>
          Promise.resolve([
            {
              key: 'blobs/x',
              metadata: {},
              contentDisposition: `inline; filename="${markers.filename}"`,
              bytes: new Uint8Array(),
            },
          ]),
      }),
      markers,
      signal,
    )
    expect(report.findings).toEqual([{ location: 'object_metadata', marker: 'filename' }])
  })

  it('the probe is purged even when the submission fails', async () => {
    const deps = clean({ submit: () => Promise.resolve({ status: 500 }) })
    const report = await runRetentionProbe(deps, markers, signal)
    expect(report.passed).toBe(false)
    expect(report.submitStatus).toBe(500)
    expect(deps.purged).toHaveLength(1)
  })

  it('the probe is purged when a collector throws', async () => {
    const deps = clean({ readLogs: () => Promise.reject(new Error('docker down')) })
    await expect(runRetentionProbe(deps, markers, signal)).rejects.toThrow('docker down')
    expect(deps.purged).toHaveLength(1)
  })

  it('the probe token passed to submit is the one purged', async () => {
    let seen = ''
    const deps = clean({
      submit: (_m, token) => {
        seen = token
        return Promise.resolve({ status: 303 })
      },
    })
    await runRetentionProbe(deps, markers, signal)
    expect(deps.purged).toEqual([seen])
    expect(seen.length).toBeGreaterThan(20)
  })
})
