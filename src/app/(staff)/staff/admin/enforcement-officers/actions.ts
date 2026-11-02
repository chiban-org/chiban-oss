'use server'

import { z } from 'zod'
import { designateEnforcementOfficer } from '@/features/enforcement/designations'
import type { ActionResult } from '@/server/actionRunner'
import { runEnforcement } from '../../enforcement/enforcementAction'
import { date, uuid } from '../../enforcement/fields'

export async function designateOfficerAction(formData: FormData): Promise<ActionResult> {
  return await runEnforcement(
    formData,
    z.object({
      userId: uuid,
      title: z.string().min(1),
      adoptingAuthority: z.string().min(1),
      adoptedOn: date,
    }),
    ({ db, actor, signal }, v) => designateEnforcementOfficer(db, actor, v, signal),
    'Officer designated.',
  )
}
