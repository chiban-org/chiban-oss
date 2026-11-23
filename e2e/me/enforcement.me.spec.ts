import { expect, test } from '../fixtures/test'
import { expectNoNhTerms, signInAs } from './support'

const SHORELAND_CASE = '12 Pickerel Lane'

test('the shoreland case shows its cure notice to the owner and the occupant', async ({
  page,
  db,
}) => {
  const found = await db.one<{ id: string }>(
    'select id from enforcement_cases where location_text = $1',
    [SHORELAND_CASE],
  )
  await signInAs(page, 'staff')
  await page.goto('/staff/enforcement')
  await expect(page.getByText(SHORELAND_CASE).first()).toBeVisible()
  await expectNoNhTerms(page)

  await page.goto(`/staff/enforcement/${found.id}`)
  await expect(page.getByRole('heading', { name: 'Cure notice' })).toBeVisible()
  await expect(page.getByText('Shoreland cure notice')).toBeVisible()
  const notices = page.getByRole('listitem').filter({ hasText: 'Cure period ends' })
  await expect(notices).toHaveCount(2)
  await expect(notices.filter({ hasText: /^Owner: / })).toContainText(/Return receipt dated /)
  await expect(notices.filter({ hasText: /^Occupant: / })).toContainText(
    'Return receipt not recorded.',
  )
  await expect(page.getByRole('heading', { name: 'Appeals to the board of appeals' })).toBeVisible()
  await expectNoNhTerms(page)
})
