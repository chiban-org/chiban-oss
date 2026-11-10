import { readFile } from 'node:fs/promises'
import { NH_STARTERS, type StarterBundle } from '@packs/nh/starters'
import { boardKindOf } from '@/features/applications/applicationTypeSchema'
import { type OverlayIssue, zodIssues } from '@/features/demo/overlay/overlayIssue'
import { type DemoOverlay, DemoOverlaySchema } from '@/features/demo/overlay/overlaySchema'
import { planType } from '@/features/demo/overlay/planType'
import { err, ok, type Result } from '@/types/result'

export interface OverlayCheck {
  issues: OverlayIssue[]
  notInstalled: string[]
}

export function parseDemoOverlay(json: unknown): Result<DemoOverlay, OverlayIssue[]> {
  const parsed = DemoOverlaySchema.safeParse(json)
  return parsed.success ? ok(parsed.data) : err(zodIssues('', parsed.error.issues))
}

export async function loadDemoOverlayFile(
  file: string,
): Promise<Result<DemoOverlay, OverlayIssue[]>> {
  let json: unknown
  try {
    json = JSON.parse(await readFile(file, 'utf8'))
  } catch (e) {
    return err([{ path: file, message: e instanceof Error ? e.message : String(e) }])
  }
  return parseDemoOverlay(json)
}

export function typeEntry(overlay: DemoOverlay, key: string) {
  return new Map(Object.entries(overlay.applicationTypes ?? {})).get(key)
}

export function noticeFeesFor(overlay: DemoOverlay, classification: string | undefined) {
  const kind = boardKindOf(classification)
  if (kind === null) return undefined
  return Object.entries(overlay.boards ?? {}).find(([k]) => k === kind)?.[1]?.noticeFees
}

export function starterByTypeKey(
  key: string,
  starters: readonly StarterBundle[] = NH_STARTERS,
): StarterBundle | undefined {
  return starters.find((s) => s.applicationType.key === key)
}

export function checkOverlayAgainstStarters(
  overlay: DemoOverlay,
  starters: readonly StarterBundle[] = NH_STARTERS,
): OverlayCheck {
  const listed = overlay.starters ?? []
  const notInstalled = listed.filter((key) => starterByTypeKey(key, starters) === undefined)
  const issues = listed.flatMap((key) => {
    const starter = starterByTypeKey(key, starters)
    if (starter === undefined) return []
    const planned = planType({
      typeKey: key,
      entry: typeEntry(overlay, key),
      form: starter.form,
      fee: starter.feeSchedule,
      noticeFees: noticeFeesFor(overlay, starter.applicationType.classification),
    })
    return planned.ok ? [] : planned.error
  })
  return { issues, notInstalled }
}
