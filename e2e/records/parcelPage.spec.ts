import { type E2eDb, expect, test } from '../fixtures/test'

const BUSY_ADDRESS = '34 Scenario Lane'

async function busyLot(db: E2eDb): Promise<string> {
  const row = await db.one<{ id: string }>('select id from parcels where site_address = $1', [
    BUSY_ADDRESS,
  ])
  return row.id
}

test.describe('the staff parcel page as office staff', () => {
  test.use({ role: 'staff' })

  test('leads with the address and what is open, and skips straight to the content', async ({
    page,
    db,
  }) => {
    await page.goto(`/staff/parcels/${await busyLot(db)}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(BUSY_ADDRESS)
    await expect(page.getByRole('heading', { name: 'Open on this lot' })).toBeVisible()
    await expect(page.locator('[data-slot="open-now"]')).toHaveText(/^(Open: |Nothing open)/)
    await page.keyboard.press('Tab')
    const skip = page.getByRole('link', { name: 'Skip to content' })
    await expect(skip).toBeFocused()
    await skip.press('Enter')
    await expect(page.locator('#content')).toBeFocused()
  })

  test('keeps lineage behind More actions and the map behind a button on a phone', async ({
    page,
    db,
  }) => {
    const parcelId = await busyLot(db)
    await page.goto(`/staff/parcels/${parcelId}`)
    const more = page.locator('[data-slot="more-actions"]')
    await more.locator('summary').click()
    await expect(more.getByRole('link', { name: 'Record lineage event' })).toBeVisible()
    await page.setViewportSize({ width: 390, height: 844 })
    await page.reload()
    await expect(page.locator('[data-slot="open-now-strip"]')).toBeVisible()
    await expect(page.locator('[data-slot="open-now"]')).toBeHidden()
    await page.getByRole('button', { name: 'Show the map' }).click()
    await expect(page.getByRole('region', { name: 'Parcel map' })).toBeVisible()
  })
})

test.describe('the staff parcel page as an inspector', () => {
  test.use({ role: 'inspector' })

  test('gets the field version with the next inspection first and no office panels', async ({
    page,
    db,
  }) => {
    await page.goto(`/staff/parcels/${await busyLot(db)}`)
    await expect(page.locator('main[data-parcel-view="field"]')).toBeVisible()
    await expect(page.getByRole('heading', { level: 2 }).first()).toHaveText(
      'Next inspection on this lot',
    )
    await expect(page.getByText('Record lineage event')).toHaveCount(0)
    await expect(page.getByText('Override an ID')).toHaveCount(0)
  })
})
