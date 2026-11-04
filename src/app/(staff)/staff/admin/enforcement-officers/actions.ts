'use server'

import { z } from 'zod'
import {
  designateEnforcementOfficer,
  endEnforcementDesignation,
  updateEnforcementDesignation,
} from '@/features/enforcement/designations'
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

export async function endDesignationAction(formData: FormData): Promise<ActionResult> {
  return await runEnforcement(
    formData,
    z.object({ designationId: uuid, endedOn: date }),
    ({ db, actor, signal }, v) => endEnforcementDesignation(db, actor, v, signal),
    'Designation ended.',
  )
}

export async function updateDesignationAction(formData: FormData): Promise<ActionResult> {
  return await runEnforcement(
    formData,
    z.object({
      designationId: uuid,
      title: z.string().min(1),
      adoptingAuthority: z.string().min(1),
      adoptedOn: date,
    }),
    ({ db, actor, signal }, v) => updateEnforcementDesignation(db, actor, v, signal),
    'Designation saved.',
  )
}
