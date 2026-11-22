import { Pool } from 'pg'
import { FERNHOLLOW_STORIES } from '@/features/demo/me/maineStories'
import { confirmWith } from '../boards/confirm'
import { E2E_DATABASE_URL } from '../fixtures/settings'
import { expect, fillDate, test } from '../fixtures/test'
import { signInAs, storyApplicationId } from './support'

const RECEIPT_REFUSAL = 'The date cannot be before the application was received.'

interface EarlierMeeting {
  id: string
  meeting_on: string
  received_on: string
}

async function withPool<T>(fn: (pool: Pool) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: E2E_DATABASE_URL, max: 1 })
  try {
    return await fn(pool)
  } finally {
    await pool.end()
  }
}

async function earlierMeeting(): Promise<EarlierMeeting> {
  return await withPool(async (pool) => {
    const found = await pool.query<EarlierMeeting>(
      `select m.id, m.meeting_date::text as meeting_on,
         (m.meeting_date + 1)::text as received_on
       from board_meetings m join boards b on b.id = m.board_id
       where b.kind = 'planning_board' and m.status = 'scheduled'
         and m.meeting_date < current_date - 1
       order by m.meeting_date desc limit 1`,
    )
    const row = found.rows[0]
    if (row === undefined) throw new Error('no earlier planning board meeting in the seed')
    return row
  })
}

async function undecidedCopyOf(sourceId: string, receivedOn: string): Promise<string> {
  return await withPool(async (pool) => {
    const client = await pool.connect()
    try {
      await client.query('begin')
      await client.query(
        `create temp table copied_project on commit drop as
           select p.* from projects p join applications a on a.project_id = p.id where a.id = $1`,
        [sourceId],
      )
      await client.query(
        `update copied_project set id = gen_random_uuid(), title = title || ', later phase'`,
      )
      await client.query('insert into projects select * from copied_project')
      await client.query(
        'create temp table copied_application on commit drop as select * from applications where id = $1',
        [sourceId],
      )
      await client.query(
        `update copied_application set id = gen_random_uuid(),
           project_id = (select id from copied_project),
           seq = nextval(pg_get_serial_sequence('applications', 'seq')),
           number = number || '-B', state = 'under_review', substep = null,
           received_date = $1::date, completed_date = null, decided_on = null`,
        [receivedOn],
      )
      const made = await client.query<{ id: string }>(
        'insert into applications select * from copied_application returning id',
      )
      await client.query('commit')
      const id = made.rows[0]?.id
      if (id === undefined) throw new Error('the application copy was not made')
      return id
    } catch (error) {
      await client.query('rollback')
      throw error
    } finally {
      client.release()
    }
  })
}

async function removeCopy(applicationId: string): Promise<void> {
  await withPool(async (pool) => {
    const found = await pool.query<{ project_id: string }>(
      'select project_id from applications where id = $1',
      [applicationId],
    )
    await pool.query('delete from applications where id = $1', [applicationId])
    const projectId = found.rows[0]?.project_id
    if (projectId !== undefined) await pool.query('delete from projects where id = $1', [projectId])
  })
}

test.describe('a Planning Board decision without a hearing', () => {
  let applicationId = ''
  let meeting: EarlierMeeting

  test.beforeAll(async ({ db }) => {
    meeting = await earlierMeeting()
    const source = await storyApplicationId(db, FERNHOLLOW_STORIES.subdivision)
    applicationId = await undecidedCopyOf(source, meeting.received_on)
  })

  test.afterAll(async () => {
    if (applicationId !== '') await removeCopy(applicationId)
  })

  test('refuses a vote dated before the application was received', async ({ page, db }) => {
    await signInAs(page, 'admin')
    await page.goto(`/staff/applications/${applicationId}`)
    const panel = page.getByRole('region', { name: 'Hearings and decisions' })
    await panel.getByText('Record a decision without a hearing').click()
    const form = panel.getByRole('group').filter({ hasText: 'Record a decision without a hearing' })
    const select = form.getByLabel('Meeting')
    await expect(select.locator(`option[value="${meeting.id}"]`)).toHaveCount(0)

    await select.evaluate((el, id) => {
      const option = document.createElement('option')
      option.value = id
      option.text = 'Earlier meeting'
      el.appendChild(option)
    }, meeting.id)
    await select.selectOption(meeting.id)
    await fillDate(form.getByLabel(/^Date of the vote/), meeting.meeting_on)
    await form.getByLabel(/^Motion/).fill('Move to approve the later phase as presented.')
    await form.getByLabel(/^How each member voted/).fill('Rowan Tessaly: for')
    await form.getByLabel(/^Findings of fact/).fill('The later phase meets each criterion.')
    await form.getByLabel(/^Is this a significant land use decision/).selectOption('no')
    await form.getByRole('button', { name: 'Record decision' }).click()
    await confirmWith(page, "Record the board's decision?", 'Record decision')

    await expect(form.locator('[id$="-votedOn-error"]')).toHaveText(RECEIPT_REFUSAL)
    const rows = await db.rows('select id from board_decisions where application_id = $1', [
      applicationId,
    ])
    expect(rows).toEqual([])
  })
})
