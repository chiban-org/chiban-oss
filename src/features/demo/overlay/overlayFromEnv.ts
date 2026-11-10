import {
  checkOverlayAgainstStarters,
  loadDemoOverlayFile,
} from '@/features/demo/overlay/checkOverlay'
import { issueLine, type OverlayIssue } from '@/features/demo/overlay/overlayIssue'
import type { DemoOverlay } from '@/features/demo/overlay/overlaySchema'
import { err, ok, type Result } from '@/types/result'

export interface OverlaySetting {
  file: string | undefined
  demoMode: boolean
  report: (line: string) => void
}

function refusal(file: string, issues: readonly OverlayIssue[]): string {
  return [`demo overlay ${file} is invalid:`, ...issues.map((i) => `  ${issueLine(i)}`)].join('\n')
}

export async function prepareDemoOverlay(
  setting: OverlaySetting,
): Promise<Result<DemoOverlay | undefined, string>> {
  const { file, demoMode, report } = setting
  if (file === undefined) return ok(undefined)
  if (!demoMode) {
    report(`demo overlay: ignoring ${file} because CHIBAN_DEMO_MODE is off`)
    return ok(undefined)
  }
  const loaded = await loadDemoOverlayFile(file)
  if (!loaded.ok) return err(refusal(file, loaded.error))
  const checked = checkOverlayAgainstStarters(loaded.value)
  if (checked.issues.length > 0) return err(refusal(file, checked.issues))
  for (const key of checked.notInstalled) {
    report(`demo overlay: starter ${key} is not installed in this build, so it is skipped`)
  }
  return ok(loaded.value)
}
