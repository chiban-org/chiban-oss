import { mkdir, readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Page } from '@playwright/test'
import { groupByPersona, outputPath, parseManifest, type Shot } from './shotManifest'

const docsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const manifestDir = path.join(docsRoot, 'shots')
const imagesRoot = path.join(docsRoot, 'static', 'img', 'shots')
const baseUrl = (process.env.SHOTS_BASE_URL ?? 'https://demo.chiban.us').replace(/\/+$/, '')
const SIGN_IN_TIMEOUT_MS = 30_000
const PAGE_TIMEOUT_MS = 45_000

async function manifestFiles(sections: readonly string[]): Promise<string[]> {
  if (sections.length > 0) return sections.map((s) => path.join(manifestDir, `${s}.json`))
  const names = await readdir(manifestDir)
  return names
    .filter((n) => n.endsWith('.json'))
    .sort()
    .map((n) => path.join(manifestDir, n))
}

async function loadShots(files: readonly string[]): Promise<Shot[]> {
  const shots: Shot[] = []
  for (const file of files) {
    shots.push(...parseManifest(path.basename(file), JSON.parse(await readFile(file, 'utf8'))))
  }
  return shots
}

async function signIn(page: Page, persona: string): Promise<void> {
  await page.goto(`${baseUrl}/demo`, { waitUntil: 'networkidle' })
  const button = page.getByRole('button', { name: `Continue as ${persona}`, exact: true })
  if ((await button.count()) === 0) throw new Error(`no demo sign-in button for ${persona}`)
  await Promise.all([
    page.waitForURL((url) => url.pathname !== '/demo', { timeout: SIGN_IN_TIMEOUT_MS }),
    button.click(),
  ])
  await page.waitForLoadState('networkidle')
}

async function capture(page: Page, shot: Shot): Promise<void> {
  await page.setViewportSize({ width: shot.width, height: shot.height })
  await page.goto(`${baseUrl}${shot.path}`, { waitUntil: 'networkidle' })
  const landed = new URL(page.url()).pathname
  if (landed === '/demo' || landed === '/sign-in') {
    throw new Error(`${shot.path} sent ${shot.persona} to ${landed}`)
  }
  const target = outputPath(imagesRoot, shot)
  await mkdir(path.dirname(target), { recursive: true })
  await page.screenshot({ path: target, fullPage: false })
}

async function run(): Promise<number> {
  const shots = await loadShots(await manifestFiles(process.argv.slice(2)))
  if (shots.length === 0) {
    console.warn('no shots listed')
    return 0
  }
  const browser = await chromium.launch()
  let failures = 0
  try {
    for (const [persona, group] of groupByPersona(shots)) {
      const context = await browser.newContext({
        colorScheme: 'light',
        deviceScaleFactor: 1,
        viewport: { width: group[0].width, height: group[0].height },
      })
      context.setDefaultTimeout(PAGE_TIMEOUT_MS)
      context.setDefaultNavigationTimeout(PAGE_TIMEOUT_MS)
      const page = await context.newPage()
      try {
        await signIn(page, persona)
      } catch (e) {
        failures += group.length
        console.error(`sign-in as ${persona} failed: ${e instanceof Error ? e.message : e}`)
        await context.close()
        continue
      }
      for (const shot of group) {
        try {
          await capture(page, shot)
          console.warn(`wrote ${shot.file}`)
        } catch (e) {
          failures += 1
          console.error(`${shot.file} failed: ${e instanceof Error ? e.message : e}`)
        }
      }
      await context.close()
    }
  } finally {
    await browser.close()
  }
  return failures === 0 ? 0 : 1
}

run().then(
  (code) => process.exit(code),
  (e: unknown) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  },
)
