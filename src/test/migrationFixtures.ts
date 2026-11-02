import { copyFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Db } from '@/db/client'
import { roleCapabilities } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { renderPdf } from '@/features/pdf/renderPdf'
import { staffActor } from '@/test/parcels'

export const FOLDER_PATTERN = String.raw`^Map (?<map>\d+)/Lot (?<lot>\d+)(?:-(?<sub>\d+))?`
export const SERIES_KEY = 'nh.rs.correspondence_administrative'
export const LOT_14 = '007014000000000'
export const LOT_15 = '007015000000000'
export const UNKNOWN_LOT = '009099000000000'

const scannedFixture = (name: string) =>
  fileURLToPath(new URL(`./fixtures/scanned/${name}`, import.meta.url))

export async function importerActor(db: Db): Promise<Actor> {
  await db
    .insert(roleCapabilities)
    .values([
      { role: 'board_member', capability: 'document.manage' },
      { role: 'board_member', capability: 'parcel.manage' },
    ])
    .onConflictDoNothing()
  return await staffActor(db, 'board_member')
}

async function put(root: string, relative: string, from: string | Uint8Array): Promise<void> {
  const target = path.join(root, relative)
  await mkdir(path.dirname(target), { recursive: true })
  if (typeof from === 'string') await copyFile(from, target)
  else await writeFile(target, from)
}

export async function buildSourceTree(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'legacy-source-'))
  const scan = scannedFixture('alder-pond-scan.pdf')
  const deed = await renderPdf({
    title: 'Deed',
    townName: 'Town of Alder Pond',
    scale: 'document',
    blocks: [{ kind: 'paragraph', text: 'Quitclaim deed for the Fernwood Lane lot' }],
  })
  await put(root, 'Map 7/Lot 14/scan.pdf', scan)
  await put(root, 'Map 7/Lot 14/scan-copy.pdf', scan)
  await put(root, 'Map 7/Lot 14/plan.tiff', scannedFixture('alder-pond-scan.tiff'))
  await put(root, 'Map 7/Lot 14/readme.txt', scannedFixture('not-a-scan.txt'))
  await put(root, 'Map 7/Lot 14/.DS_Store', new Uint8Array([0, 0, 0, 1]))
  await put(root, 'Map 7/Lot 15/scan.pdf', scan)
  await put(root, 'Map 7/Lot 15/locked.pdf', scannedFixture('alder-pond-encrypted.pdf'))
  await put(root, 'Map 9/Lot 99/deed.pdf', deed)
  await put(root, 'Misc/notes.pdf', scan)
  return root
}
