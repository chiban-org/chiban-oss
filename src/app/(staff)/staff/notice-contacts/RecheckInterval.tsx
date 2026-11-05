'use client'

import Link from 'next/link'
import { ActionForm } from '@/components/ActionForm'
import { publishImpact } from '@/components/config/PublishBar'
import { FormDialog } from '@/components/FormDialog'
import { TextField } from '@/components/staff/fields'
import { isPinnedKind } from '@/features/config/kinds'
import { changeRecheckIntervalAction } from './intervalActions'

export const RECHECK_HINT =
  'Past this, an association, park or restriction holder shows Due for a check and lists print it as out of date. Nothing is blocked.'

export function recheckSentence(days: number): string {
  return `Contacts are due for a check every ${days} days.`
}

export function RecheckInterval({ days, canEdit }: { days: number; canEdit: boolean }) {
  return (
    <p className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1">
      <span>{recheckSentence(days)}</span>
      {canEdit ? (
        <span className="text-muted-foreground">
          This is a board setting, so each change is saved as a version.{' '}
          <Link href="/staff/settings/board_settings" aria-label="Board settings version history">
            Version history
          </Link>
        </span>
      ) : null}
      {canEdit ? (
        <FormDialog
          label="Change"
          accessibleLabel="Change how often contacts are due for a check"
          title="How often contacts are checked"
          size="sm"
        >
          <ActionForm
            action={changeRecheckIntervalAction}
            submitLabel="Publish"
            variant="default"
            confirm={{
              title: 'Publish these changes?',
              body: `${publishImpact(isPinnedKind('board_settings'))} You can restore an earlier version from the version history later.`,
              confirmLabel: 'Publish now',
              cancelLabel: 'Keep editing',
              tone: 'default',
            }}
          >
            <TextField
              label="Days between checks"
              hint={RECHECK_HINT}
              name="days"
              type="number"
              min={1}
              max={3650}
              step={1}
              defaultValue={days}
              required
            />
          </ActionForm>
        </FormDialog>
      ) : null}
    </p>
  )
}
