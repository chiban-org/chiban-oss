import { and, asc, desc, eq, gte } from 'drizzle-orm'
import type { Db } from '@/db/client'
import {
  acceptanceSchedules,
  applicationProfessionals,
  boardMeetings,
  desProximityDeterminations,
  regionalImpactDeterminations,
  regionalImpactParties,
  selectmenCertifications,
} from '@/db/schema'
import { applicantParcelIds } from '@/features/abutters/applicantParcels'
import { type NoticeCostSummary, noticeCostSummary } from '@/features/abutters/noticeCosts'
import { listVersions } from '@/features/abutters/queries'
import { hasOpenRegeneration } from '@/features/abutters/staleList'
import { hasFullRecordAccess } from '@/features/access/roles'
import { loadApplicationContext } from '@/features/applications/context'
import { type CoreState, TERMINAL_STATES } from '@/features/applications/states'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { boardOfApplication } from '@/features/boards/boardOf'
import { certificationPhrase } from '@/features/boards/certificationWords'
import { desRuleIfPresent, suggestDesProximity } from '@/features/boards/des500'
import { desText, suggestionText } from '@/features/boards/desPanelText'
import { type MeetingEligibility, meetingEligibility } from '@/features/boards/meetingEligibility'
import { boardPanelClocks, boundByClassification } from '@/features/boards/panelClocks'
import { getRegionalContacts } from '@/features/boards/regionalContacts'
import { boardForKind, missingBoardMessage } from '@/features/boards/townBoards'
import { loadPack } from '@/features/packs/loadPack'
import { activePack } from '@/features/packs/registry'
import { packRoles } from '@/features/packs/roles'
import type { BoardKind } from '@/features/packs/schema'
import { displayIdsFor } from '@/features/parcels/displayId'
import { mayManageAbutters } from '@/features/rosters/manage'
import { townToday } from '@/features/town/today'
import { formatCivilDate } from '@/lib/formatDate'
import type { CivilDate } from '@/types/civilDate'

export interface BoardPanelData {
  applicationId: string
  boardKind: BoardKind
  boardName: string
  missingBoard: string | null
  state: string
  canRecord: boolean
  canManage: boolean
  canOpenLists: boolean
  canDetermine: boolean
  hasFilingLead: boolean
  acceptanceText: string | null
  acceptanceMeetingId: string | null
  acceptanceDate: string | null
  meetings: ({ id: string; date: string; text: string } & MeetingEligibility)[]
  today: string
  regional: {
    text: string | null
    summary: string
    options: { key: string; name: string }[]
    chosen: string[]
  }
  des: {
    applies: boolean
    suggestion: string
    determinationText: string | null
    distanceText: string
    suggestedDetermination: 'within_500ft' | 'not_within' | null
  }
  lists: {
    id: string
    version: number
    statusText: string
    drawnText: string
    issued: boolean
    draft: boolean
  }[]
  notice: NoticeCostSummary
  professionals: { id: string; text: string }[]
  parcels: string[]
  certification: { offered: boolean; history: string[] }
  exerciseText: string | null
  hasExercise: boolean
}

const PROFESSION_TEXT = {
  engineer: 'Engineer',
  architect: 'Architect',
  land_surveyor: 'Land surveyor',
  soil_scientist: 'Soil scientist',
} as const

const DETERMINATION_TEXT = {
  yes: 'Regional impact: yes',
  no: 'Regional impact: no',
  previously_determined: 'Regional impact: previously determined by another board',
} as const

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1) ?? ''}`
}

function regionalSummary(text: string | null, names: string[]): string {
  if (text === null) return 'Regional impact has not been determined.'
  return names.length === 0 ? `${text}.` : `${text}. Affected municipalities: ${joinNames(names)}.`
}

const STALE_ISSUED = 'Issued, out of date. Draw and issue a new list.'

const LIST_STATUS = {
  draft: 'Draft',
  issued: 'Issued',
  superseded: 'Replaced',
  discarded: 'Discarded',
} as const

async function changePermissions(db: Db, actor: Actor, state: CoreState, signal: AbortSignal) {
  if (TERMINAL_STATES.includes(state)) {
    return { canRecord: false, canManage: false, canDetermine: false }
  }
  const [canRecord, canManage, canDetermine] = await Promise.all([
    hasCapability(db, actor.userId, 'board.record', signal),
    hasCapability(db, actor.userId, 'abutters.manage', signal),
    hasCapability(db, actor.userId, 'regional_impact.determine', signal),
  ])
  return { canRecord, canManage, canDetermine }
}

export async function loadBoardPanel(
  db: Db,
  actor: Actor,
  applicationId: string,
  signal: AbortSignal,
): Promise<BoardPanelData | null> {
  signal.throwIfAborted()
  if (!hasFullRecordAccess(actor)) return null
  const app = await loadApplicationContext(db, applicationId, signal)
  if (app === null) return null
  const boardKind = boardOfApplication(app)
  if (boardKind === null) return null
  const boardRow = await boardForKind(db, boardKind, signal)
  const today = await townToday(db, new Date(), signal)
  const pack = loadPack()
  const classification = pack.classifications.find((c) => c.key === app.typeBody.classification)
  const contacts = await getRegionalContacts(db, signal)
  const meetings =
    boardRow === null
      ? []
      : await db
          .select()
          .from(boardMeetings)
          .where(
            and(
              eq(boardMeetings.boardId, boardRow.id),
              eq(boardMeetings.status, 'scheduled'),
              gte(boardMeetings.meetingDate, today),
            ),
          )
          .orderBy(asc(boardMeetings.meetingDate))
  const eligible = await meetingEligibility(db, app, boardRow?.id ?? '', today, signal)
  const [schedule] = await db
    .select({ id: boardMeetings.id, date: boardMeetings.meetingDate })
    .from(acceptanceSchedules)
    .innerJoin(boardMeetings, eq(boardMeetings.id, acceptanceSchedules.meetingId))
    .where(eq(acceptanceSchedules.applicationId, applicationId))
  const [determination] = await db
    .select()
    .from(regionalImpactDeterminations)
    .where(eq(regionalImpactDeterminations.applicationId, applicationId))
  const parties = await db
    .select()
    .from(regionalImpactParties)
    .where(eq(regionalImpactParties.applicationId, applicationId))
  const [des] = await db
    .select()
    .from(desProximityDeterminations)
    .where(eq(desProximityDeterminations.applicationId, applicationId))
  const { rules } = packRoles()
  const proximity = desRuleIfPresent()
  const desApplies =
    proximity !== null &&
    classification?.abutters?.conditionalRoles.some((r) => r.when === 'des_within_500ft') === true
  const distanceFt = proximity?.distanceFt ?? 0
  const suggested = desApplies
    ? await suggestDesProximity(db, applicationId, new Date(), signal)
    : { state: 'unknown' as const }
  const text = suggestionText(suggested, distanceFt)
  const versions = await listVersions(db, applicationId, signal)
  const stale = await hasOpenRegeneration(db, applicationId)
  const people = await db
    .select()
    .from(applicationProfessionals)
    .where(eq(applicationProfessionals.applicationId, applicationId))
  const parcelIds = await applicantParcelIds(db, applicationId, signal)
  const labels = await displayIdsFor(db, parcelIds)
  const panelClocks = await boardPanelClocks(db, applicationId)
  const certs = await db
    .select()
    .from(selectmenCertifications)
    .where(eq(selectmenCertifications.applicationId, applicationId))
    .orderBy(desc(selectmenCertifications.requestedOn))
  return {
    applicationId,
    boardKind,
    boardName: boardRow?.name ?? activePack().boardKinds[boardKind].label,
    missingBoard: boardRow === null ? missingBoardMessage(boardKind) : null,
    state: app.state,
    ...(await changePermissions(db, actor, app.state, signal)),
    canOpenLists: await mayManageAbutters(db, actor.userId, signal),
    hasFilingLead: boundByClassification(classification?.mandatoryRuleKeys, rules.filingLead),
    acceptanceText: schedule === undefined ? null : formatCivilDate(schedule.date),
    acceptanceMeetingId: schedule?.id ?? null,
    acceptanceDate: schedule?.date ?? null,
    meetings: meetings.map((m) => ({
      id: m.id,
      date: m.meetingDate,
      ...eligible(m),
      text: `${formatCivilDate(m.meetingDate)}, ${m.kind === 'special' ? 'special' : 'regular'} meeting`,
    })),
    today,
    regional: {
      text: determination === undefined ? null : DETERMINATION_TEXT[determination.determination],
      summary: regionalSummary(
        determination === undefined ? null : DETERMINATION_TEXT[determination.determination],
        contacts.municipalities
          .filter((m) => parties.some((p) => p.municipalityKey === m.key))
          .map((m) => m.name)
          .sort(),
      ),
      options: contacts.municipalities.map((m) => ({ key: m.key, name: m.name })),
      chosen: parties.map((p) => p.municipalityKey),
    },
    des: {
      applies: desApplies,
      suggestion: text.suggestion,
      distanceText: text.distance,
      suggestedDetermination: text.determination,
      determinationText: des === undefined ? null : desText(des.determination),
    },
    lists: versions.map((v) => ({
      id: v.id,
      version: v.version,
      statusText: v.status === 'issued' && stale ? STALE_ISSUED : LIST_STATUS[v.status],
      drawnText: formatCivilDate(v.drawnOn),
      issued: v.status === 'issued',
      draft: v.status === 'draft',
    })),
    notice: await noticeCostSummary(db, applicationId, signal),
    professionals: people.map((p) => ({
      id: p.id,
      text: `${p.name}, ${PROFESSION_TEXT[p.profession]}${p.sealOnPlat ? ', seal on the plat' : ''}`,
    })),
    parcels: parcelIds.map((id) => labels.get(id) ?? 'Parcel'),
    certification: {
      offered: panelClocks.decisionOpen,
      history: certs.map(
        (c) => `${formatCivilDate(c.requestedOn)}: ${certificationPhrase(c.outcome)}`,
      ),
    },
    exerciseText:
      panelClocks.exerciseDue === null ? null : formatCivilDate(panelClocks.exerciseDue),
    hasExercise: boundByClassification(classification?.mandatoryRuleKeys, rules.zbaExercise),
  }
}
