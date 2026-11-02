import type { Board } from '@packs/nh/schema'
import { and, asc, desc, eq, gte, inArray } from 'drizzle-orm'
import type { Db } from '@/db/client'
import {
  acceptanceSchedules,
  applicationProfessionals,
  boardMeetings,
  clocks,
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
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { boardOfApplication } from '@/features/boards/boardOf'
import { boardLabel, getBoardSettings } from '@/features/boards/boardSettings'
import { desRule, suggestDesProximity } from '@/features/boards/des500'
import { getRegionalContacts } from '@/features/boards/regionalContacts'
import { loadPack } from '@/features/packs/loadPack'
import { displayIdsFor } from '@/features/parcels/displayId'
import { townToday } from '@/features/town/today'
import { formatCivilDate } from '@/lib/formatDate'

export interface BoardPanelData {
  applicationId: string
  board: Board
  boardName: string
  state: string
  canRecord: boolean
  canManage: boolean
  canDetermine: boolean
  hasFilingLead: boolean
  acceptanceText: string | null
  acceptanceMeetingId: string | null
  acceptanceDate: string | null
  meetings: { id: string; text: string }[]
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
  lists: { id: string; version: number; statusText: string; drawnText: string; issued: boolean }[]
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

const DES_TEXT = {
  within_500ft: 'Within the distance of a water body: NH DES receives notice',
  not_within: 'Not within the distance of a water body',
  not_applicable: 'The notice to NH DES does not apply',
} as const

const STALE_ISSUED = 'Issued, out of date. Draw and issue a new list.'

const LIST_STATUS = {
  draft: 'Draft',
  issued: 'Issued',
  superseded: 'Replaced',
  discarded: 'Discarded',
} as const

function suggestionText(
  s: Awaited<ReturnType<typeof suggestDesProximity>>,
  distanceFt: number,
): {
  suggestion: string
  distance: string
  determination: 'within_500ft' | 'not_within' | null
} {
  if (s.state === 'known' || s.state === 'stale') {
    const feet = s.value.withinFt === null ? null : Math.round(s.value.withinFt)
    return {
      determination: s.value.within ? 'within_500ft' : 'not_within',
      suggestion: s.value.within
        ? `The map suggests this parcel is within ${distanceFt} feet of a water body.`
        : `The map suggests this parcel is farther than ${distanceFt} feet from any water body.`,
      distance: feet === null ? '' : `Nearest water body: about ${feet} feet from the parcel.`,
    }
  }
  return {
    suggestion: 'The map cannot suggest an answer because the water layer is not usable.',
    distance: '',
    determination: null,
  }
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
  const board = boardOfApplication(app)
  if (board === null) return null
  const today = await townToday(db, new Date(), signal)
  const pack = loadPack()
  const classification = pack.classifications.find((c) => c.key === app.typeBody.classification)
  const settings = await getBoardSettings(db, signal)
  const contacts = await getRegionalContacts(db, signal)
  const meetings = await db
    .select()
    .from(boardMeetings)
    .where(
      and(
        eq(boardMeetings.board, board),
        eq(boardMeetings.status, 'scheduled'),
        gte(boardMeetings.meetingDate, today),
      ),
    )
    .orderBy(asc(boardMeetings.meetingDate))
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
  const desApplies =
    classification?.abutters?.conditionalRoles.some((r) => r.when === 'des_within_500ft') === true
  const distanceFt = desRule().distanceFt
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
  const [overdue] = await db
    .select({ id: clocks.id })
    .from(clocks)
    .where(
      and(
        eq(clocks.applicationId, applicationId),
        eq(clocks.ruleKey, 'nh.pb.decision'),
        inArray(clocks.status, ['running', 'overdue']),
      ),
    )
  const certs = await db
    .select()
    .from(selectmenCertifications)
    .where(eq(selectmenCertifications.applicationId, applicationId))
    .orderBy(desc(selectmenCertifications.requestedOn))
  const [exercise] = await db
    .select()
    .from(clocks)
    .where(
      and(
        eq(clocks.applicationId, applicationId),
        eq(clocks.ruleKey, 'nh.zba.exercise'),
        eq(clocks.status, 'running'),
      ),
    )
  return {
    applicationId,
    board,
    boardName: boardLabel(settings, board),
    state: app.state,
    canRecord: await hasCapability(db, actor.userId, 'board.record', signal),
    canManage: await hasCapability(db, actor.userId, 'abutters.manage', signal),
    canDetermine: await hasCapability(db, actor.userId, 'regional_impact.determine', signal),
    hasFilingLead: classification?.mandatoryRuleKeys.includes('nh.pb.filing_lead') === true,
    acceptanceText: schedule === undefined ? null : formatCivilDate(schedule.date),
    acceptanceMeetingId: schedule?.id ?? null,
    acceptanceDate: schedule?.date ?? null,
    meetings: meetings.map((m) => ({
      id: m.id,
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
      determinationText: des === undefined ? null : DES_TEXT[des.determination],
    },
    lists: versions.map((v) => ({
      id: v.id,
      version: v.version,
      statusText: v.status === 'issued' && stale ? STALE_ISSUED : LIST_STATUS[v.status],
      drawnText: formatCivilDate(v.drawnOn),
      issued: v.status === 'issued',
    })),
    notice: await noticeCostSummary(db, applicationId, signal),
    professionals: people.map((p) => ({
      id: p.id,
      text: `${p.name}, ${PROFESSION_TEXT[p.profession]}${p.sealOnPlat ? ', seal on the plat' : ''}`,
    })),
    parcels: parcelIds.map((id) => labels.get(id) ?? 'Parcel'),
    certification: {
      offered: overdue !== undefined,
      history: certs.map(
        (c) =>
          `${formatCivilDate(c.requestedOn)}: ${c.outcome === 'pending' ? 'requested, waiting on the selectmen' : c.outcome === 'certified' ? 'certified by the selectmen' : 'the selectmen refused'}`,
      ),
    },
    exerciseText: exercise === undefined ? null : formatCivilDate(exercise.currentDue),
    hasExercise: classification?.mandatoryRuleKeys.includes('nh.zba.exercise') === true,
  }
}
