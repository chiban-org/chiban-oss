import { type E2eDb, expect, test } from '../fixtures/test'
import { expectRefusedBeside } from './support'

interface AssignmentRow {
  id: string
}

async function assignmentFor(db: E2eDb, number: string): Promise<AssignmentRow> {
  return await db.one<AssignmentRow>(
    `select ra.id from review_assignments ra
       join applications a on a.id = ra.application_id
       join users u on u.id = ra.reviewer_user_id
      where a.number = $1 and u.display_name = 'Remy Reviewer' and ra.removed_at is null`,
    [number],
  )
}

test.describe('reviewing an assigned application', () => {
  test.describe('as the reviewer', () => {
    test.use({ role: 'reviewer' })

    test('refuses an empty comment beside the field and stores nothing', async ({ page, db }) => {
      const { id } = await assignmentFor(db, 'EL-2026-0003')
      await page.goto(`/staff/reviews/${id}`)
      const comments = page.getByRole('region', { name: 'Comments' })
      await comments.getByLabel('Comment').fill('   ')
      await comments.getByRole('button', { name: 'Add comment' }).click()

      await expectRefusedBeside(comments.getByLabel('Comment'), 'Enter a comment.')
      const row = await db.one<{ count: string }>(
        'select count(*) from review_comments where assignment_id = $1 and trim(body) = $2',
        [id, ''],
      )
      expect(Number(row.count)).toBe(0)
    })

    test('adds a comment and stores it against the assignment', async ({ page, db, suffix }) => {
      const { id } = await assignmentFor(db, 'EL-2026-0003')
      const body = `Panel schedule needs the breaker sizes, ref ${suffix}`
      await page.goto(`/staff/reviews/${id}`)
      const comments = page.getByRole('region', { name: 'Comments' })
      await comments.getByLabel('Comment').fill(body)
      await comments.getByRole('button', { name: 'Add comment' }).click()

      await expect(comments.getByRole('status')).toHaveText('Comment added.')
      await expect(comments.getByRole('listitem').filter({ hasText: body })).toHaveCount(1)
      const row = await db.one<{ body: string }>(
        'select body from review_comments where assignment_id = $1 and body = $2',
        [id, body],
      )
      expect(row.body).toBe(body)
    })

    test('signs off and stores the sign-off', async ({ page, db }) => {
      const { id } = await assignmentFor(db, 'SPR-2026-0001')
      await page.goto(`/staff/reviews/${id}`)
      await page.getByRole('button', { name: 'Sign off' }).click()

      await expect(page.getByText('You signed off on this review.')).toBeVisible()
      const row = await db.one<{ status: string; signed_off_at: Date | null }>(
        'select status, signed_off_at from review_assignments where id = $1',
        [id],
      )
      expect(row.status).toBe('signed_off')
      expect(row.signed_off_at).not.toBeNull()
    })
  })

  test.describe('as the clerk', () => {
    test.use({ role: 'staff' })

    test('cannot open another person review and sees no comment form', async ({ page, db }) => {
      const { id } = await assignmentFor(db, 'EL-2026-0003')
      await page.goto(`/staff/reviews/${id}`)
      await expect(page.getByRole('button', { name: 'Add comment' })).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Sign off' })).toHaveCount(0)
    })
  })
})
