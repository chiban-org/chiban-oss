import type { NoticeRequirementRule, ProceedingClassification } from '@packs/nh/schema'
import { eq } from 'drizzle-orm'
import type { Tx } from '@/db/client'
import {
  desProximityDeterminations,
  noticeItems,
  noticeSets,
  regionalImpactDeterminations,
} from '@/db/schema'
import { currentIssuedList } from '@/features/abutters/queries'
import { loadApplicationContext } from '@/features/applications/context'
import type { BoardSettingsBody } from '@/features/boards/boardSettingsSchema'
import { getPublished } from '@/features/config/store'
import type { NoticeChannel } from '@/features/notices/channels'
import {
  type PlanInput,
  type PlannedRequirement,
  planRequirement,
  type RequirementFlags,
} from '@/features/notices/requirementPlan'
import { requirementsFor } from '@/features/notices/requirementsFor'
import { loadPack } from '@/features/packs/loadPack'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export interface DeriveInput {
  subjectKind: string
  subjectId: string
  applicationId: string
  anchorDate: CivilDate
}

export type DeriveError = 'no_issued_list' | 'determination_missing' | 'not_found'

type ItemRow = typeof noticeItems.$inferInsert
type PublicNotice = BoardSettingsBody['boards'][number]['publicNotice']

const BULLETIN_KEY = 'town.notice.bulletin_board'
const WEBSITE_KEY = 'town.notice.website'

async function townLeads(
  tx: Tx,
  requirements: NoticeRequirementRule[],
  signal: AbortSignal,
): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  for (const key of new Set(requirements.map((r) => r.leadRuleKey))) {
    const published = await getPublished(tx, 'town_rule_setting', key, signal)
    const value = (published?.body as { value: number } | undefined)?.value
    if (value !== undefined) out[key] = value
  }
  return out
}

async function flagsFor(
  tx: Tx,
  applicationId: string,
  needsDes: boolean,
): Promise<RequirementFlags | null> {
  const [ri] = await tx
    .select({ determination: regionalImpactDeterminations.determination })
    .from(regionalImpactDeterminations)
    .where(eq(regionalImpactDeterminations.applicationId, applicationId))
  if (ri === undefined) return null
  const [des] = await tx
    .select({ determination: desProximityDeterminations.determination })
    .from(desProximityDeterminations)
    .where(eq(desProximityDeterminations.applicationId, applicationId))
  if (needsDes && des === undefined) return null
  return {
    regionalImpact: ri.determination === 'yes',
    desWithin: des?.determination === 'within_500ft',
  }
}

function publicChoices(notice: PublicNotice | null): PlanInput['publicChoice'][] {
  if (notice === null) return [null]
  const chosen: PlanInput['publicChoice'][] = []
  if (notice.posting) chosen.push('public_posting')
  if (notice.publication && notice.newspaper !== null) chosen.push('newspaper')
  return chosen.length === 0 ? [null] : chosen
}

function publicName(channel: NoticeChannel, notice: PublicNotice | null): string | null {
  if (channel === 'newspaper') return notice?.newspaper ?? null
  return null
}

function rowFor(
  rule: NoticeRequirementRule,
  plan: PlannedRequirement,
  setId: string,
  extra: Pick<ItemRow, 'recipientKey' | 'recipientName' | 'recipientAddress' | 'roles'>,
): ItemRow {
  return {
    setId,
    requirementKey: rule.key,
    requirementVersion: rule.version,
    source: 'pack_rule',
    channel: plan.channel,
    dueOn: plan.dueOn,
    countingMethod: plan.countingMethod,
    ...extra,
  }
}

interface Context {
  classification: ProceedingClassification
  list: NonNullable<Awaited<ReturnType<typeof currentIssuedList>>>
  flags: RequirementFlags
  notice: PublicNotice | null
  leads: Record<string, number>
  all: NoticeRequirementRule[]
}

async function loadContext(
  tx: Tx,
  applicationId: string,
  signal: AbortSignal,
): Promise<Result<Context, DeriveError>> {
  const app = await loadApplicationContext(tx, applicationId, signal)
  if (app === null) return err('not_found')
  const pack = loadPack()
  const classification = pack.classifications.find((c) => c.key === app.typeBody.classification)
  if (classification === undefined) return err('not_found')
  const list = await currentIssuedList(tx, applicationId, signal)
  if (list === null) return err('no_issued_list')
  const all = classification.noticeRequirementKeys.flatMap((key) => {
    const rule = pack.rules.find((r) => r.key === key)
    return rule?.kind === 'notice_requirement' ? [rule] : []
  })
  const flags = await flagsFor(
    tx,
    applicationId,
    all.some((r) => r.onlyWhen === 'des_within_500ft'),
  )
  if (flags === null) return err('determination_missing')
  const settings = await getPublished(tx, 'board_settings', 'default', signal)
  const boards = (settings?.body as BoardSettingsBody | undefined)?.boards ?? []
  const notice = boards.find((b) => b.board === classification.board)?.publicNotice ?? null
  return ok({ classification, list, flags, notice, leads: await townLeads(tx, all, signal), all })
}

function rowsForRequirement(
  rule: NoticeRequirementRule,
  ctx: Context,
  input: DeriveInput,
  setId: string,
): { rows: ItemRow[]; publicPlan: PlannedRequirement | null } {
  const rows: ItemRow[] = []
  let publicPlan: PlannedRequirement | null = null
  const choices = typeof rule.channel === 'string' ? [null] : publicChoices(ctx.notice)
  for (const publicChoice of choices) {
    const plan = planRequirement(rule, {
      hearingDate: input.anchorDate,
      flags: ctx.flags,
      townLeadDays: ctx.leads,
      publicChoice,
    })
    if (plan === null) continue
    if ('public' in rule.recipients) {
      publicPlan = plan
      rows.push(
        rowFor(rule, plan, setId, {
          recipientKey: null,
          recipientName: publicName(plan.channel, ctx.notice),
          recipientAddress: null,
          roles: [],
        }),
      )
      continue
    }
    const wanted = new Set<string>(rule.recipients.roles)
    for (const r of ctx.list.snapshot.recipients.filter((x) =>
      x.roles.some((o) => wanted.has(o)),
    )) {
      rows.push(
        rowFor(rule, plan, setId, {
          recipientKey: r.key,
          recipientName: r.name,
          recipientAddress: r.mailingAddress,
          roles: r.roles,
        }),
      )
    }
  }
  return { rows, publicPlan }
}

function townExtras(setId: string, plan: PlannedRequirement, notice: PublicNotice): ItemRow[] {
  const base = {
    setId,
    requirementVersion: 1,
    source: 'town_setting' as const,
    dueOn: plan.dueOn,
    countingMethod: plan.countingMethod,
    recipientKey: null,
    recipientAddress: null,
    roles: [],
  }
  const boards = notice.bulletinBoards.map(
    (name): ItemRow => ({
      ...base,
      requirementKey: BULLETIN_KEY,
      channel: 'bulletin_board',
      recipientName: name,
    }),
  )
  const website: ItemRow[] =
    notice.websiteUrl === null
      ? []
      : [
          {
            ...base,
            requirementKey: WEBSITE_KEY,
            channel: 'website',
            recipientName: notice.websiteUrl,
          },
        ]
  return [...boards, ...website]
}

export async function deriveNoticeItems(
  tx: Tx,
  input: DeriveInput,
  signal: AbortSignal,
): Promise<Result<{ setId: string; items: number }, DeriveError>> {
  signal.throwIfAborted()
  const loaded = await loadContext(tx, input.applicationId, signal)
  if (!loaded.ok) return loaded
  const ctx = loaded.value
  const [set] = await tx
    .insert(noticeSets)
    .values({
      subjectKind: input.subjectKind,
      subjectId: input.subjectId,
      applicationId: input.applicationId,
      anchorDate: input.anchorDate,
    })
    .returning({ id: noticeSets.id })
  const setId = set?.id ?? ''
  const rows: ItemRow[] = []
  let publicPlan: PlannedRequirement | null = null
  for (const rule of requirementsFor(ctx.classification, ctx.flags)) {
    const made = rowsForRequirement(rule, ctx, input, setId)
    rows.push(...made.rows)
    publicPlan = made.publicPlan ?? publicPlan
  }
  if (publicPlan !== null && ctx.notice !== null)
    rows.push(...townExtras(setId, publicPlan, ctx.notice))
  if (rows.length > 0) await tx.insert(noticeItems).values(rows)
  return ok({ setId, items: rows.length })
}
