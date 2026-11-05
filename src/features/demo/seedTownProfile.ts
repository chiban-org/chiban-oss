import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Db } from '@/db/client'
import { publishConfig } from '@/features/config/publish'
import { getPublished, saveDraft } from '@/features/config/store'
import { actorFor, must } from '@/features/demo/seedPermitSupport'
import type { ObjectStore } from '@/features/storage/objectStore'
import type { TownImage, TownProfileBody } from '@/features/town/profileSchema'
import { storeTownImage } from '@/features/town/townImages'

async function fixtureImage(store: ObjectStore, file: string, signal: AbortSignal) {
  const bytes = readFileSync(fileURLToPath(new URL(`./fixtures/${file}`, import.meta.url)))
  return must(await storeTownImage(store, new Uint8Array(bytes), signal), `store ${file}`)
}

function demoProfile(images: {
  seal: TownImage
  building: TownImage
  landUse: TownImage
}): TownProfileBody {
  return {
    key: 'default',
    officeName: 'Land Use Office',
    addressLines: ['Alder Pond Town Hall', '1 Main Street', 'Alder Pond, NH 03000'],
    phone: '603-555-0100',
    email: 'landuse@alderpond.example',
    website: 'https://alderpond.example',
    officeHours: 'Monday to Thursday, 8 to 4',
    logo: images.seal,
    letterhead: {
      logoPosition: 'left',
      contactLines: { address: true, phone: true, email: true, website: true, officeHours: false },
      footerText: 'Town of Alder Pond Land Use Office.',
      pageNumbers: true,
    },
    boardOverrides: {
      planning_board: {
        officeName: 'Alder Pond Planning Board',
        footerText: 'Planning Board meetings are open to the public.',
      },
      zba: {
        officeName: 'Alder Pond Zoning Board of Adjustment',
        footerText: 'Zoning Board of Adjustment meetings are open to the public.',
      },
    },
    signers: [
      {
        role: 'building_official',
        name: 'Ira Inspector',
        title: 'Building Official',
        signature: images.building,
      },
      {
        role: 'land_use_administrator',
        name: 'Avery Admin',
        title: 'Land Use Administrator',
        signature: images.landUse,
      },
      {
        role: 'planning_board_chair',
        name: 'Robin Vale',
        title: 'Chair, Planning Board',
        signature: null,
      },
      {
        role: 'zba_chair',
        name: 'Drew Hale',
        title: 'Chair, Zoning Board of Adjustment',
        signature: null,
      },
      {
        role: 'code_enforcement_officer',
        name: 'Sam Clerk',
        title: 'Code Enforcement Officer',
        signature: null,
      },
      { role: 'town_clerk', name: 'Rae Records', title: 'Town Clerk', signature: null },
    ],
  }
}

export async function seedTownProfile(
  db: Db,
  store: ObjectStore,
  signal: AbortSignal,
): Promise<boolean> {
  if ((await getPublished(db, 'town_profile', 'default', signal)) !== null) return false
  const admin = await actorFor(db, 'admin', signal)
  const body = demoProfile({
    seal: await fixtureImage(store, 'alder-pond-seal.png', signal),
    building: await fixtureImage(store, 'signature-building-official.png', signal),
    landUse: await fixtureImage(store, 'signature-land-use.png', signal),
  })
  const draft = must(
    await saveDraft(db, admin, { kind: 'town_profile', key: 'default', body }, signal),
    'save the town profile',
  )
  must(await publishConfig(db, admin, draft.versionId, signal), 'publish the town profile')
  return true
}
