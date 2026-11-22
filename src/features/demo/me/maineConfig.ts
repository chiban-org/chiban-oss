import type { Db } from '@/db/client'
import type { Actor } from '@/features/auth/actor'
import { renameBoard } from '@/features/boards/boardAdmin'
import { boardSettingsDefault } from '@/features/boards/boardSettingsSchema'
import { activeBoards } from '@/features/boards/townBoards'
import { adoptStarter } from '@/features/config/adoptStarter'
import type { ConfigKind } from '@/features/config/kindNames'
import { publishNewVersion } from '@/features/config/publish'
import { FERNHOLLOW } from '@/features/demo/me/maineTown'
import { must } from '@/features/demo/seedPermitSupport'
import { activePack } from '@/features/packs/registry'
import type { TownProfileBody } from '@/features/town/profileSchema'
import type { CivilDate } from '@/types/civilDate'

const TOWN_OFFICE_BOARD = 'Fernhollow Town Office bulletin board'

export const FERNHOLLOW_CONTACTS = {
  key: 'default',
  commission: null,
  nhDes: null,
  municipalities: [
    {
      key: 'brackett',
      name: 'Town of Brackett',
      mailingAddress: '11 Grange Road, Brackett, ME 04000',
      clerk: {
        name: 'Brackett Town Clerk',
        mailingAddress: '11 Grange Road, Brackett, ME 04000',
      },
      reviewingAuthority: {
        name: 'Brackett Planning Board',
        mailingAddress: '11 Grange Road, Brackett, ME 04000',
      },
    },
  ],
  waterSuppliers: [
    {
      key: 'fernhollow_water',
      name: 'Fernhollow Water District',
      mailingAddress: '8 Standpipe Road, Fernhollow, ME 04000',
    },
  ],
}

function townProfile(): TownProfileBody {
  return {
    key: 'default',
    officeName: 'Code Enforcement Office',
    addressLines: [...FERNHOLLOW.addressLines],
    phone: '207-555-0140',
    email: 'ceo@fernhollow.example',
    website: 'https://fernhollow.example',
    officeHours: 'Monday to Thursday, 8 to 4',
    logo: null,
    letterhead: {
      logoPosition: 'left',
      contactLines: {
        address: true,
        phone: true,
        email: true,
        website: true,
        officeHours: false,
      },
      footerText: 'Town of Fernhollow Code Enforcement Office.',
      pageNumbers: true,
    },
    boardOverrides: {},
    signers: [
      {
        role: 'building_official',
        name: 'Dana Booth',
        title: 'Building Official',
        signature: null,
      },
      {
        role: 'land_use_administrator',
        name: 'Avery Admin',
        title: 'Town Manager',
        signature: null,
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
        title: 'Chair, Board of Appeals',
        signature: null,
      },
      {
        role: 'code_enforcement_officer',
        name: 'Lee Piper',
        title: 'Code Enforcement Officer and Local Plumbing Inspector',
        signature: null,
      },
      {
        role: 'plumbing_inspector',
        name: 'Lee Piper',
        title: 'Local Plumbing Inspector',
        signature: null,
      },
      {
        role: 'town_clerk',
        name: 'Rae Records',
        title: 'Town Clerk',
        signature: null,
      },
    ],
  }
}

function publisher(db: Db, admin: Actor, signal: AbortSignal) {
  return async (kind: ConfigKind, body: object) => {
    const published = await db.transaction((tx) =>
      publishNewVersion(tx, admin, { kind, key: 'default', body }, 'config.publish', signal),
    )
    must(published, `publish ${kind}`)
  }
}

async function renameBoards(db: Db, admin: Actor, signal: AbortSignal): Promise<void> {
  const names = {
    planning_board: {
      name: 'Fernhollow Planning Board',
      shortName: 'Planning Board',
    },
    zba: { name: 'Fernhollow Board of Appeals', shortName: 'Board of Appeals' },
  } as const
  for (const board of await activeBoards(db)) {
    const wanted =
      board.kind === 'planning_board' || board.kind === 'zba' ? names[board.kind] : null
    if (wanted === null) continue
    must(await renameBoard(db, admin, { boardId: board.id, ...wanted }, signal), 'rename board')
  }
}

async function boardSettings(db: Db, layersConfirmedOn: CivilDate) {
  const active = await activeBoards(db)
  const body = boardSettingsDefault(active)
  const kindOf = new Map(active.map((b) => [b.id, b.kind]))
  return {
    ...body,
    boards: body.boards.map((entry) => ({
      ...entry,
      publicNotice: {
        ...entry.publicNotice,
        newspaper: kindOf.get(entry.boardId) === 'zba' ? 'Fernhollow Weekly Courier' : null,
        bulletinBoards: [TOWN_OFFICE_BOARD],
      },
    })),
    abutters: {
      ...body.abutters,
      projectionEnabled: false,
      layersConfirmedBy: 'Code Enforcement Officer',
      layersConfirmedOn,
    },
  }
}

export async function seedMaineConfig(
  db: Db,
  admin: Actor,
  layersConfirmedOn: CivilDate,
  signal: AbortSignal,
): Promise<void> {
  await renameBoards(db, admin, signal)
  const publish = publisher(db, admin, signal)
  await publish('town_profile', townProfile())
  await publish('building_program', {
    key: 'default',
    permitsEnabled: true,
    codeChoice: FERNHOLLOW.code,
    residents: FERNHOLLOW.residents,
  })
  await publish('regional_contacts', FERNHOLLOW_CONTACTS)
  await publish('board_settings', await boardSettings(db, layersConfirmedOn))
  await publish('inspection_settings', activePack().inspectionSettingsDefault)
  for (const starter of activePack().starters) {
    const adopted = await adoptStarter(db, admin, starter.id, signal)
    if (!adopted.ok && adopted.error !== 'already_adopted') must(adopted, `adopt ${starter.id}`)
  }
}
