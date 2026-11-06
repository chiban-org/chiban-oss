import type { E2eDb } from '../fixtures/test'

export async function townToday(db: E2eDb): Promise<string> {
  const row = await db.one<{ today: string }>(
    'select (now() at time zone time_zone)::date::text as today from town_settings',
  )
  return row.today
}

export async function daysFromToday(db: E2eDb, days: number): Promise<string> {
  const row = await db.one<{ day: string }>(
    'select ((now() at time zone time_zone)::date + $1::int)::text as day from town_settings',
    [days],
  )
  return row.day
}

export async function applicationIdFor(db: E2eDb, title: string): Promise<string> {
  const row = await db.one<{ id: string }>(
    'select a.id from applications a join projects p on p.id = a.project_id where p.title = $1',
    [`Demo permit: ${title}`],
  )
  return row.id
}
