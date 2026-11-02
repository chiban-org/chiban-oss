import { describe, expect, it } from 'vitest'
import { parseLegacyDocsArgs } from '@/features/migration/cliArgs'

describe('parseLegacyDocsArgs', () => {
  it('scan needs a staff email, a root, a name, a series, a pattern, and an id format', () => {
    const parsed = parseLegacyDocsArgs([
      'scan',
      '--as',
      'clerk@alderpond.example',
      '--root',
      '/srv/scans',
      '--name',
      'Basement',
      '--series',
      'nh.rs.correspondence_administrative',
      '--pattern',
      '^Map (?<map>\\d+)',
      '--id-format',
      'cama15',
    ])
    expect(parsed).toEqual({
      ok: true,
      value: {
        command: 'scan',
        as: 'clerk@alderpond.example',
        scan: {
          root: '/srv/scans',
          name: 'Basement',
          seriesKey: 'nh.rs.correspondence_administrative',
          folderPattern: '^Map (?<map>\\d+)',
          idFormat: 'cama15',
        },
      },
    })
  })

  it('run and report need a batch id', () => {
    expect(parseLegacyDocsArgs(['run', '--as', 'clerk@alderpond.example']).ok).toBe(false)
    const parsed = parseLegacyDocsArgs([
      'report',
      '--as',
      'clerk@alderpond.example',
      '--batch',
      '00000000-0000-4000-8000-000000000000',
    ])
    expect(parsed.ok && parsed.value.command).toBe('report')
  })

  it('an unknown subcommand or a missing --as is refused', () => {
    expect(parseLegacyDocsArgs(['publish', '--as', 'a@b.example']).ok).toBe(false)
    expect(parseLegacyDocsArgs(['scan']).ok).toBe(false)
  })
})
