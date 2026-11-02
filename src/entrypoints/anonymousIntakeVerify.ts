import { randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { eq } from 'drizzle-orm'
import sharp from 'sharp'
import { APP_VERSION } from '@/config/appVersion'
import { env } from '@/config/env'
import { db, pool } from '@/db/client'
import { sessions, userRoles, users } from '@/db/schema'
import { purgeProbes } from '@/features/anonymousIntake/purgeProbe'
import {
  parseVerifyCliArgs,
  VERIFY_CLI_USAGE,
  type VerifyCliArgs,
} from '@/features/anonymousIntake/retentionCli'
import {
  dumpDatabaseText,
  listObjectsForProbe,
  newestBackupIn,
  readBackupForProbe,
} from '@/features/anonymousIntake/retentionCollect'
import { type ProbeMarkers, runRetentionProbe } from '@/features/anonymousIntake/retentionProbe'
import { issueProbeToken, recordVerification } from '@/features/anonymousIntake/staffControl'
import { createSession } from '@/features/auth/session'
import { getObjectStore, objectStoreConfigFromEnv } from '@/features/storage/objectStore'

const TIMEOUT_MS = 30 * 60 * 1000
const TAG_BYTES = 6
const IMAGE_SIZE = 24
const signal = AbortSignal.timeout(TIMEOUT_MS)

function fail(message: string, code: number): never {
  process.stderr.write(`${message}\n`)
  process.exit(code)
}

type CheckArgs = Extract<VerifyCliArgs, { phase: 'check' }>

interface SubmitRecord {
  controlQuery: string
  status: number
  token: string
  userId: string
  markers: Omit<ProbeMarkers, 'clientIp'>
}

async function createResident(tag: string) {
  const [user] = await db
    .insert(users)
    .values({
      email: `probe-${tag}@verification.invalid`,
      displayName: 'Verification probe',
      kind: 'public',
    })
    .returning({ id: users.id, email: users.email })
  const row = user ?? fail('could not create the probe resident', 1)
  await db.insert(userRoles).values({ userId: row.id, role: 'applicant' })
  const session = await createSession(db, row.id, signal)
  if (!session.ok) fail('could not create the probe session', 1)
  return { userId: row.id, email: row.email, sid: session.value.sid }
}

async function submit(): Promise<void> {
  const tag = randomBytes(TAG_BYTES).toString('hex')
  const resident = await createResident(tag)
  const token = await issueProbeToken(db)
  const markers = {
    userAgent: `probe-ua-${tag}`,
    filename: `probe-name-${tag}.jpg`,
    exifArtist: `probe-artist-${tag}`,
    sessionUserId: resident.userId,
    sessionEmail: resident.email,
  }
  const controlQuery = `control=${tag}`
  await fetch(`${env.BASE_URL}/?${controlQuery}`)
  const image = await sharp({
    create: {
      width: IMAGE_SIZE,
      height: IMAGE_SIZE,
      channels: 3,
      background: { r: 90, g: 120, b: 60 },
    },
  })
    .jpeg()
    .withExif({ IFD0: { Artist: markers.exifArtist } })
    .toBuffer()
  const form = new FormData()
  form.append('location', 'Retention verification')
  form.append('description', 'Retention verification submission')
  form.append('photos', new File([new Uint8Array(image)], markers.filename, { type: 'image/jpeg' }))
  const response = await fetch(`${env.BASE_URL}/intake/anonymous`, {
    method: 'POST',
    body: form,
    redirect: 'manual',
    headers: {
      'user-agent': markers.userAgent,
      cookie: `chiban_sid=${resident.sid}`,
      'x-chiban-probe': token,
    },
  })
  const record: SubmitRecord = {
    controlQuery,
    status: response.status,
    token,
    userId: resident.userId,
    markers,
  }
  process.stdout.write(`${JSON.stringify(record)}\n`)
}

async function removeResident(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId))
  await db.delete(userRoles).where(eq(userRoles.userId, userId))
  await db.delete(users).where(eq(users.id, userId))
}

async function check(args: CheckArgs): Promise<void> {
  const record = JSON.parse(await readFile(args.markers, 'utf8')) as SubmitRecord
  const logs = await readFile(args.logs, 'utf8')
  const store = getObjectStore()
  const report = await runRetentionProbe(
    {
      submit: () => Promise.resolve({ status: record.status }),
      dumpDatabase: (s) => dumpDatabaseText(db, s),
      readLogs: () => Promise.resolve(logs),
      listObjects: (s) => listObjectsForProbe(objectStoreConfigFromEnv(), store, s),
      async readBackup(s) {
        const file = await newestBackupIn(args.backupDir)
        if (file === null || env.BACKUP_PASSPHRASE === undefined) return null
        return await readBackupForProbe(
          { file, passphrase: env.BACKUP_PASSPHRASE, pgRestorePath: env.PG_RESTORE_PATH },
          s,
        )
      },
      purge: (token, s) => purgeProbes(db, store, token, s),
    },
    { ...record.markers, clientIp: args.clientIp },
    signal,
    { token: record.token },
  )
  await removeResident(record.userId)
  await recordVerification(db, {
    imageRef: env.CHIBAN_IMAGE_REF ?? null,
    appVersion: APP_VERSION,
    caddyfileSha256: args.caddyfileSha256,
    passed: report.passed,
    findings: report.findings,
  })
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  await pool.end()
  process.exit(report.passed ? 0 : 1)
}

const args = parseVerifyCliArgs(process.argv.slice(2))
if (!args.ok) fail(VERIFY_CLI_USAGE, 2)
if (args.value.phase === 'submit') {
  await submit()
  await pool.end()
} else {
  await check(args.value)
}
