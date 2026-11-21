import { eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { applications, projects, relianceLinks } from '@/db/schema'
import { varianceValidity } from '@/features/decisions/recording'
import type { VarianceValidity } from '@/features/decisions/recordingRequired'
import { packRoles } from '@/features/packs/roles'
import { latestDecisions } from '@/features/parcels/boardOutcomes'
import { APPROVING_OUTCOMES } from '@/features/parcels/openGroups'

export interface RelianceView {
  choices: { id: string; number: string }[]
  linked: { id: string; number: string; validity: VarianceValidity }[]
}

export async function loadRelianceView(
  db: Db,
  applicationId: string,
  parcelId: string,
  signal: AbortSignal,
): Promise<RelianceView | null> {
  if (packRoles().gates.varianceRecorded === null) return null
  const links = await db
    .select({ id: applications.id, number: applications.number })
    .from(relianceLinks)
    .innerJoin(applications, eq(applications.id, relianceLinks.varianceApplicationId))
    .where(eq(relianceLinks.planningApplicationId, applicationId))
    .orderBy(applications.number)
  const linked: RelianceView['linked'] = []
  for (const link of links) {
    linked.push({ ...link, validity: await varianceValidity(db, link.id, signal) })
  }
  const onParcel = (
    await db
      .select({ id: applications.id, number: applications.number })
      .from(applications)
      .innerJoin(projects, eq(projects.id, applications.projectId))
      .where(eq(projects.parcelId, parcelId))
      .orderBy(applications.number)
  ).filter((a) => a.id !== applicationId && !linked.some((l) => l.id === a.id))
  const decisions = await latestDecisions(
    db,
    onParcel.map((a) => a.id),
  )
  const choices: RelianceView['choices'] = []
  for (const candidate of onParcel) {
    const outcome = decisions.get(candidate.id)?.outcome
    if (outcome === undefined || !APPROVING_OUTCOMES.includes(outcome)) continue
    if ((await varianceValidity(db, candidate.id, signal)) !== 'not_required') {
      choices.push(candidate)
    }
  }
  return { choices, linked }
}
