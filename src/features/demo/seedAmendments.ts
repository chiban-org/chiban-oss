import type { Db } from '@/db/client'
import type { Actor } from '@/features/auth/actor'
import type { LocalCodeAmendmentBody } from '@/features/config/kinds'
import { publishConfig } from '@/features/config/publish'
import { getPublished, saveDraft } from '@/features/config/store'
import { storyDay } from '@/features/demo/seedCalendar'
import { actorFor, must } from '@/features/demo/seedPermitSupport'
import type { CivilDate } from '@/types/civilDate'

type Revision = LocalCodeAmendmentBody

interface DemoAmendment {
  key: string
  revisions: Revision[]
}

const SNOW_STATE_TEXT =
  'R301.2.1 Roofs shall be designed for the ground snow load shown in Table R301.2. The roof snow load shall be determined from the ground snow load and shall not be reduced for roofs with a slope of less than 30 degrees.'

const RISER_STATE_TEXT =
  'R311.7.5.1 Riser height. The maximum riser height shall be 7 3/4 inches (196 mm). The riser shall be measured vertically between leading edges of the adjacent treads. The greatest riser height within any flight of stairs shall not exceed the smallest by more than 3/8 inch (9.5 mm).'

const FROST_STATE_TEXT =
  'R403.1.4.1 Frost protection. Exterior footings shall be placed not less than 12 inches (305 mm) below the undisturbed ground surface. Where applicable, the depth of footings shall also conform to Sections R403.1.4.1.1 through R403.1.4.1.2.'

const amendments = (): DemoAmendment[] => [
  {
    key: 'roof-snow-load',
    revisions: [
      {
        title: 'Ground snow load for roofs',
        codeSection: 'IRC R301.2.1',
        adoptingAuthority: 'Town Meeting',
        adoptedOn: storyDay('2025-03-11'),
        reviewBoardConfirmedOn: storyDay('2025-06-02'),
        stateText: SNOW_STATE_TEXT,
        townText:
          'R301.2.1 Roofs shall be designed for a ground snow load of 50 pounds per square foot. The roof snow load shall be determined from the ground snow load and shall not be reduced for roofs with a slope of less than 30 degrees.',
      },
      {
        title: 'Ground snow load for roofs',
        codeSection: 'IRC R301.2.1',
        adoptingAuthority: 'Town Meeting',
        adoptedOn: storyDay('2026-03-10'),
        reviewBoardConfirmedOn: storyDay('2026-05-04'),
        stateText: SNOW_STATE_TEXT,
        townText:
          'R301.2.1 Roofs shall be designed for a ground snow load of 60 pounds per square foot. The roof snow load shall be determined from the ground snow load and shall not be reduced for roofs with a slope of less than 45 degrees.',
      },
    ],
  },
  {
    key: 'stair-riser-height',
    revisions: [
      {
        title: 'Maximum stair riser height',
        codeSection: 'IRC R311.7.5.1',
        adoptingAuthority: 'Select Board',
        adoptedOn: storyDay('2025-09-08'),
        reviewBoardConfirmedOn: storyDay('2025-11-17'),
        stateText: RISER_STATE_TEXT,
        townText:
          'R311.7.5.1 Riser height. The maximum riser height shall be 7 1/2 inches (190 mm). The riser shall be measured vertically between leading edges of the adjacent treads. The greatest riser height within any flight of stairs shall not exceed the smallest by more than 3/8 inch (9.5 mm).',
      },
    ],
  },
  {
    key: 'footing-frost-depth',
    revisions: [
      {
        title: 'Footing depth below frost',
        codeSection: 'IRC R403.1.4.1',
        adoptingAuthority: 'Town Meeting',
        adoptedOn: storyDay('2026-03-10'),
        reviewBoardConfirmedOn: null,
        stateText: FROST_STATE_TEXT,
        townText:
          'R403.1.4.1 Frost protection. Exterior footings shall be placed not less than 48 inches (1219 mm) below the undisturbed ground surface. Where applicable, the depth of footings shall also conform to Sections R403.1.4.1.1 through R403.1.4.1.2.',
      },
    ],
  },
  {
    key: 'wood-stove-clearance',
    revisions: [
      {
        title: 'Wood stove hearth clearance',
        codeSection: 'Local addition to IRC R1001',
        adoptingAuthority: 'Select Board',
        adoptedOn: storyDay('2025-10-20'),
        reviewBoardConfirmedOn: storyDay('2025-12-15'),
        townText:
          'A wood stove shall be set on a noncombustible hearth that extends at least 18 inches beyond the stove on the door side and 8 inches on the other sides.',
      },
    ],
  },
]

async function publishRevision(
  db: Db,
  admin: Actor,
  input: { key: string; body: Revision },
  signal: AbortSignal,
): Promise<void> {
  const saved = must(
    await saveDraft(db, admin, { kind: 'local_code_amendment', ...input }, signal),
    `amendment ${input.key} draft`,
  )
  must(await publishConfig(db, admin, saved.versionId, signal), `amendment ${input.key} publish`)
}

export async function seedAmendments(db: Db, signal: AbortSignal): Promise<boolean> {
  signal.throwIfAborted()
  const all = amendments()
  const first = all[0]
  if (first === undefined) return false
  if ((await getPublished(db, 'local_code_amendment', first.key, signal)) !== null) return false
  const admin = await actorFor(db, 'admin', signal)
  for (const amendment of all) {
    for (const revision of amendment.revisions) {
      await publishRevision(db, admin, { key: amendment.key, body: revision }, signal)
    }
  }
  return true
}
