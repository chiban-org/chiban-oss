import {
  checkOverlayAgainstStarters,
  loadDemoOverlayFile,
} from '@/features/demo/overlay/checkOverlay'
import { issueLine } from '@/features/demo/overlay/overlayIssue'

const file = process.argv[2]
if (file === undefined) {
  console.error('usage: demo-overlay-check <overlay.json>')
  process.exit(2)
}

const loaded = await loadDemoOverlayFile(file)
const issues = loaded.ok ? checkOverlayAgainstStarters(loaded.value).issues : loaded.error
for (const issue of issues) console.error(issueLine(issue))
if (!loaded.ok || issues.length > 0) process.exit(1)

const { notInstalled } = checkOverlayAgainstStarters(loaded.value)
for (const key of notInstalled) {
  console.warn(`starter ${key} is not installed in this build, so a reset will skip it`)
}
console.warn(`${file}: valid`)
process.exit(0)
