import type { Metadata } from 'next'
import { permanentRedirect } from 'next/navigation'
import { requireStaffActor } from '@/server/requireStaff'

export const metadata: Metadata = { title: 'CAMA owner import' }

const TIMEOUT_MS = 10_000

export default async function OldCamaImportPath(): Promise<never> {
  await requireStaffActor(AbortSignal.timeout(TIMEOUT_MS))
  permanentRedirect('/staff/gis/imports/cama')
}
