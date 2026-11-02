import { randomBytes } from 'node:crypto'

export interface ProbeMarkers {
  clientIp: string
  userAgent: string
  filename: string
  exifArtist: string
  sessionUserId: string
  sessionEmail: string
}

export interface ProbeObject {
  key: string
  metadata: Record<string, string>
  contentDisposition: string | null
  bytes: Uint8Array
}

export interface ProbeBackup {
  database: string
  objects: { key: string; metadata: Record<string, string> }[]
}

export interface ProbeDeps {
  submit(
    markers: ProbeMarkers,
    probeToken: string,
    signal: AbortSignal,
  ): Promise<{ status: number }>
  dumpDatabase(signal: AbortSignal): Promise<string>
  readLogs(signal: AbortSignal): Promise<string>
  listObjects(signal: AbortSignal): Promise<ProbeObject[]>
  readBackup(signal: AbortSignal): Promise<ProbeBackup | null>
  purge(probeToken: string, signal: AbortSignal): Promise<void>
}

export type ProbeLocation =
  | 'database'
  | 'logs'
  | 'object_metadata'
  | 'object_bytes'
  | 'backup_database'
  | 'backup_objects'
  | 'backup_missing'

export interface ProbeFinding {
  location: ProbeLocation
  marker: keyof ProbeMarkers | null
}

export interface ProbeReport {
  passed: boolean
  findings: ProbeFinding[]
  submitStatus: number
}

const MARKER_KEYS = [
  'clientIp',
  'userAgent',
  'filename',
  'exifArtist',
  'sessionUserId',
  'sessionEmail',
] as const satisfies readonly (keyof ProbeMarkers)[]

const TOKEN_BYTES = 24
const ADDRESS_NEIGHBOURS = '[0-9.]'
const NEEDS_ESCAPE = /[.*+?^${}()|[\]\\]/g

function textHas(text: string, key: keyof ProbeMarkers, value: string): boolean {
  if (key !== 'clientIp') return text.includes(value)
  const escaped = value.replace(NEEDS_ESCAPE, '\\$&')
  return new RegExp(`(?<!${ADDRESS_NEIGHBOURS})${escaped}(?!${ADDRESS_NEIGHBOURS})`).test(text)
}

function scan(
  text: string,
  location: ProbeLocation,
  markers: ProbeMarkers,
  into: ProbeFinding[],
): void {
  for (const key of MARKER_KEYS) {
    if (textHas(text, key, markers[key])) into.push({ location, marker: key })
  }
}

function objectMetadataText(
  o: { key: string; metadata: Record<string, string> },
  disposition: string | null,
): string {
  return [o.key, ...Object.entries(o.metadata).flat(), disposition ?? ''].join('\n')
}

async function collect(
  deps: ProbeDeps,
  markers: ProbeMarkers,
  signal: AbortSignal,
): Promise<ProbeFinding[]> {
  const findings: ProbeFinding[] = []
  scan(await deps.dumpDatabase(signal), 'database', markers, findings)
  scan(await deps.readLogs(signal), 'logs', markers, findings)
  for (const object of await deps.listObjects(signal)) {
    scan(
      objectMetadataText(object, object.contentDisposition),
      'object_metadata',
      markers,
      findings,
    )
    scan(Buffer.from(object.bytes).toString('latin1'), 'object_bytes', markers, findings)
  }
  const backup = await deps.readBackup(signal)
  if (backup === null) {
    findings.push({ location: 'backup_missing', marker: null })
    return findings
  }
  scan(backup.database, 'backup_database', markers, findings)
  for (const object of backup.objects) {
    scan(objectMetadataText(object, null), 'backup_objects', markers, findings)
  }
  return findings
}

export async function runRetentionProbe(
  deps: ProbeDeps,
  markers: ProbeMarkers,
  signal: AbortSignal,
  options: { token?: string } = {},
): Promise<ProbeReport> {
  const token = options.token ?? randomBytes(TOKEN_BYTES).toString('hex')
  try {
    const submitted = await deps.submit(markers, token, signal)
    const findings = await collect(deps, markers, signal)
    const unique = [...new Map(findings.map((f) => [`${f.location}:${f.marker}`, f])).values()]
    return {
      passed: unique.length === 0 && submitted.status === 303,
      findings: unique,
      submitStatus: submitted.status,
    }
  } finally {
    await deps.purge(token, signal)
  }
}
