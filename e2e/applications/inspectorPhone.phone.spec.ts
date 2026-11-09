import type { Locator, Page } from '@playwright/test'
import { expectPhoneFit, shoot } from '../fixtures/phone'
import { scheduleOwed, scheduleToday } from '../fixtures/phoneInspections'
import { accountFor, expect, test } from '../fixtures/test'
import { expectConfirmation } from './support'

const INSPECTOR = accountFor('inspector').email
const PHOTO_TITLE = 'Stair opening at the landing'
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==',
  'base64',
)

test.describe('an inspector on a phone', () => {
  test.use({ role: 'inspector' })

  test('opens the day, records a failed item with a note, adds a camera photo and sees both on the record', async ({
    page,
    db,
    suffix,
  }) => {
    const stop = await scheduleToday(INSPECTOR, suffix)

    await page.goto('/staff/inspections/day')
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/\d{4}/)
    const record = page.locator(`a[href="/staff/inspections/${stop.id}"]`)
    await expect(record).toBeVisible()
    await expectPhoneFit(page, 'day-list')

    await record.click()
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByRole('radiogroup').first()).toBeVisible()
    await expectPhoneFit(page, 'inspection-open', workAreas(page, 'Do this now', 'Photos'))

    const groups = page.getByRole('radiogroup')
    const count = await groups.count()
    for (let index = 0; index < count; index += 1) {
      await groups.nth(index).getByRole('radio', { name: 'Pass' }).tap()
    }
    await groups.first().getByRole('radio', { name: 'Fail' }).tap()
    await page.getByLabel(/^Note on /).fill('Blocking missing at the stair opening.')
    await page
      .getByLabel('Notes for the permit holder')
      .fill('Add fire blocking at the stair opening and call for a reinspection.')
    await expect(page.getByText('Result: Failed')).toBeVisible()
    await expectPhoneFit(page, 'result-form-failed', workAreas(page, 'Do this now', 'Photos'))

    await page.getByRole('button', { name: 'Record result' }).tap()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expectNoDialogOverflow(page)
    await shoot(page, 'confirm-dialog')
    await dialog.getByRole('button', { name: 'Record as failed' }).tap()
    await expectConfirmation(page, 'Result recorded.')

    const saved = await db.one<{ status: string; result_notes: string }>(
      'select status, result_notes from inspections where id = $1',
      [stop.id],
    )
    expect(saved.status).toBe('failed')
    expect(saved.result_notes).toContain('fire blocking')
    const failedItems = await db.rows<{ note: string }>(
      "select note from inspection_item_results where inspection_id = $1 and outcome = 'fail'",
      [stop.id],
    )
    expect(failedItems).toEqual([{ note: 'Blocking missing at the stair opening.' }])

    const photos = page.getByRole('region', { name: 'Photos' })
    await photos.getByText('Add a photo').tap()
    const camera = photos.locator('input[type=file][capture=environment]')
    await expect(camera).toHaveCount(1)
    await camera.setInputFiles({
      name: 'landing.png',
      mimeType: 'image/png',
      buffer: ONE_PIXEL_PNG,
    })
    await photos.getByLabel('What the photo shows').fill(PHOTO_TITLE)
    await expectPhoneFit(page, 'photo-chosen', workAreas(page, 'Do this now', 'Result', 'Photos'))
    const upload = photos.getByRole('button', { name: 'Upload' })
    await page.locator('[data-sonner-toaster]').evaluate((el) => el.remove())
    await upload.tap()

    await expect(photos.getByRole('link', { name: PHOTO_TITLE })).toBeVisible()
    const stored = await db.one<{ doc_kind: string }>(
      "select doc_kind from documents where record_kind = 'inspection' and record_id = $1 and title = $2",
      [stop.id, PHOTO_TITLE],
    )
    expect(stored.doc_kind).toBe('inspection_photo')
    await expect(page.getByRole('region', { name: 'Result' })).toContainText('Fail')
    await expectPhoneFit(
      page,
      'record-with-photo',
      workAreas(page, 'Do this now', 'Result', 'Photos'),
    )
  })

  test('sees the results still owed on the day page and opens one', async ({ page, suffix }) => {
    const owed = await scheduleOwed(INSPECTOR, suffix)
    await page.goto('/staff/inspections/day')
    const section = page.locator('#missing-results')
    await expect(section).toBeVisible()
    const link = section.locator(`a[href="/staff/inspections/${owed.id}"]`)
    await expect(link).toBeVisible()
    await expectPhoneFit(page, 'still-need-a-result')
    await section
      .getByRole('link', { name: `${owed.applicationNumber}, Framing` })
      .first()
      .tap()
    await expect(page).toHaveURL(new RegExp(`/staff/inspections/${owed.id}$`))
    await expect(page.getByRole('radiogroup').first()).toBeVisible()
  })
})

test.describe('the results owed page on a phone', () => {
  test.use({ role: 'staff' })

  test('lists owed results without sideways scroll and with full size controls', async ({
    page,
    suffix,
  }) => {
    const owed = await scheduleOwed(INSPECTOR, `${suffix}7`)
    await page.goto('/staff/inspections/owed')
    await expect(page.getByRole('heading', { level: 1, name: 'Results owed' })).toBeVisible()
    await expect(page.getByText(owed.applicationNumber).first()).toBeVisible()
    await expectPhoneFit(page, 'owed-page')
  })
})

function workAreas(page: Page, ...names: string[]): Locator[] {
  return names.map((name) => page.getByRole('region', { name }))
}

async function expectNoDialogOverflow(page: Page): Promise<void> {
  const box = await page.getByRole('dialog').boundingBox()
  expect(box).not.toBeNull()
  expect((box?.x ?? -1) >= 0 && (box?.x ?? 0) + (box?.width ?? 0) <= 390).toBe(true)
}
