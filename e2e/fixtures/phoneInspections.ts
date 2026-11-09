import { Pool } from 'pg'
import { E2E_DATABASE_URL } from './settings'

const TOWN_TIME_ZONE = 'America/New_York'
const FIRST_FREE_MINUTE = 600
const FREE_MINUTES = 360
const OWED_DAYS = 3

export interface PhoneInspection {
  id: string
  applicationNumber: string
  typeLabel: string
  scheduledDate: string
}

function civilToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TOWN_TIME_ZONE }).format(new Date())
}

function daysBefore(date: string, days: number): string {
  const moved = new Date(`${date}T12:00:00Z`)
  moved.setUTCDate(moved.getUTCDate() - days)
  return moved.toISOString().slice(0, 10)
}

async function scheduleFromSeed(options: {
  inspectorEmail: string
  scheduledDate: string
  startMinute: number
}): Promise<PhoneInspection> {
  const pool = new Pool({ connectionString: E2E_DATABASE_URL, max: 1 })
  try {
    const made = await pool.query<{ id: string; number: string }>(
      `insert into inspections (application_id, checklist_version_id, inspection_type, is_final,
         status, channel, requested_by_user_id, contact_name, contact_phone, access_notes,
         inspector_user_id, scheduled_date, start_minute, duration_minutes)
       select i.application_id, i.checklist_version_id, i.inspection_type, false, 'scheduled',
         i.channel, i.requested_by_user_id, i.contact_name, i.contact_phone, i.access_notes,
         (select id from users where email = $1), $2::date, $3, i.duration_minutes
       from inspections i join applications a on a.id = i.application_id
       where a.number = 'BP-2025-0001' and i.inspection_type = 'framing'
       order by i.requested_at limit 1
       returning id, (select number from applications where id = application_id) as number`,
      [options.inspectorEmail, options.scheduledDate, options.startMinute],
    )
    const row = made.rows[0]
    if (row === undefined) throw new Error('no seeded framing inspection to copy')
    return {
      id: row.id,
      applicationNumber: row.number,
      typeLabel: 'Framing',
      scheduledDate: options.scheduledDate,
    }
  } finally {
    await pool.end()
  }
}

function freeMinute(suffix: string): number {
  const digits = Number.parseInt(suffix.replace(/\D/g, '').slice(-4) || '0', 10)
  return FIRST_FREE_MINUTE + (digits % FREE_MINUTES)
}

export async function scheduleToday(inspectorEmail: string, suffix: string) {
  return await scheduleFromSeed({
    inspectorEmail,
    scheduledDate: civilToday(),
    startMinute: freeMinute(suffix),
  })
}

export async function scheduleOwed(inspectorEmail: string, suffix: string) {
  return await scheduleFromSeed({
    inspectorEmail,
    scheduledDate: daysBefore(civilToday(), OWED_DAYS),
    startMinute: freeMinute(suffix),
  })
}
