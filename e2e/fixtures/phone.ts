import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { expect, type Locator, type Page } from '@playwright/test'

const MIN_TAP_PX = 44
const INTERACTIVE = [
  'a[href]',
  'button',
  'summary',
  'select',
  'textarea',
  'input:not([type=hidden]):not([type=file])',
  '[role=radio]',
  '[role=checkbox]',
  '[role=tab]',
].join(', ')

export interface SmallTarget {
  name: string
  width: number
  height: number
}

export async function expectNoSidewaysScroll(page: Page): Promise<void> {
  const widths = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth,
    window: window.innerWidth,
  }))
  expect
    .soft(widths.page, 'the page is wider than the phone screen')
    .toBeLessThanOrEqual(widths.window)
}

export async function smallTargets(scope: Locator): Promise<SmallTarget[]> {
  return await scope.evaluate(
    (root, args) => {
      const owners = new Set<HTMLElement>()
      for (const el of Array.from(root.querySelectorAll<HTMLElement>(args.selector))) {
        const isChoice =
          el.getAttribute('role') === 'radio' || el.getAttribute('role') === 'checkbox'
        owners.add((isChoice ? el.closest<HTMLElement>('label') : null) ?? el)
      }
      const inSentence = (owner: HTMLElement) =>
        owner.tagName === 'A' &&
        getComputedStyle(owner).display === 'inline' &&
        owner.parentElement?.tagName === 'P'
      const found: { name: string; width: number; height: number }[] = []
      for (const owner of owners) {
        const box = owner.getBoundingClientRect()
        if (box.width === 0 || box.height === 0 || inSentence(owner)) continue
        if (box.width >= args.min && box.height >= args.min) continue
        const label = (owner.getAttribute('aria-label') ?? owner.innerText).trim()
        found.push({
          name: `${owner.tagName.toLowerCase()} "${label.slice(0, 40)}"`,
          width: Math.round(box.width),
          height: Math.round(box.height),
        })
      }
      return found
    },
    { selector: INTERACTIVE, min: MIN_TAP_PX },
  )
}

export async function expectTapTargets(page: Page, scopes: Locator[]): Promise<void> {
  for (const scope of scopes) {
    expect.soft(await smallTargets(scope), 'controls under 44px').toEqual([])
  }
}

export async function expectPhoneFit(
  page: Page,
  shot: string,
  scopes: Locator[] = [page.locator('main')],
): Promise<void> {
  await shoot(page, shot)
  await expectNoSidewaysScroll(page)
  await expectTapTargets(page, scopes)
}

export async function shoot(page: Page, name: string): Promise<void> {
  const dir = process.env.PHONE_SCREENSHOT_DIR
  if (dir === undefined || dir === '') return
  await mkdir(dir, { recursive: true })
  await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: true })
}
