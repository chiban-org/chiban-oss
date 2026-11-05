'use client'

import { type FormEvent, startTransition, useActionState, useState } from 'react'
import { publishTownSectionAction } from '@/app/(staff)/staff/settings/town-profile/actions'
import { CsrfField } from '@/components/CsrfField'
import type { FieldErrors } from '@/components/config/primitives'
import { LetterheadFields } from '@/components/config/town/LetterheadFields'
import { LetterheadPreview } from '@/components/config/town/LetterheadPreview'
import { ProfileFields } from '@/components/config/town/ProfileFields'
import { SignersFields } from '@/components/config/town/SignersFields'
import { Button } from '@/components/ui/button'
import { RequiredNote } from '@/components/ui/required-mark'
import { useHydrated } from '@/components/useHydrated'
import type { TownProfileBody } from '@/features/town/profileSchema'
import type { TownProfileSection } from '@/features/town/profileSettings'
import { words } from '@/lib/words'
import type { ActionResult } from '@/server/actionRunner'

interface Props {
  section: TownProfileSection
  initial: TownProfileBody
  resetKey: string
  townName: string
}

function statusText(pending: boolean, result: ActionResult | null): string | null {
  if (pending) return 'Publishing'
  if (result === null) return null
  return result.ok ? result.message : result.error
}

function SectionFields({
  section,
  body,
  onChange,
  errors,
  townName,
}: Omit<Props, 'initial' | 'resetKey'> & {
  body: TownProfileBody
  onChange: (b: TownProfileBody) => void
  errors: FieldErrors
}) {
  if (section === 'profile')
    return <ProfileFields body={body} onChange={onChange} errors={errors} />
  if (section === 'signers')
    return <SignersFields body={body} onChange={onChange} errors={errors} />
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <LetterheadFields body={body} onChange={onChange} />
      <div className="lg:sticky lg:top-6 lg:self-start">
        <LetterheadPreview townName={townName} body={body} />
      </div>
    </div>
  )
}

export function TownSectionForm({ section, initial, resetKey, townName }: Props) {
  const [body, setBody] = useState(initial)
  const [seenKey, setSeenKey] = useState(resetKey)
  if (seenKey !== resetKey) {
    setSeenKey(resetKey)
    setBody(initial)
  }
  const [result, run, pending] = useActionState(
    async (_previous: ActionResult | null, formData: FormData) =>
      await publishTownSectionAction(formData),
    null,
  )
  const hydrated = useHydrated()
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    startTransition(() => run(data))
  }
  const errors: FieldErrors = result !== null && !result.ok ? (result.fieldErrors ?? {}) : {}
  const listed = Object.entries(errors).filter(([path]) => path !== '_form')
  return (
    <form onSubmit={submit} className={section === 'letterhead' ? 'max-w-6xl' : 'max-w-3xl'}>
      <RequiredNote className="mb-5" />
      <CsrfField />
      <input type="hidden" name="section" value={section} />
      <input type="hidden" name="body" value={JSON.stringify(body)} />
      <SectionFields
        section={section}
        townName={townName}
        body={body}
        onChange={setBody}
        errors={errors}
      />
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending || !hydrated}>
          Publish
        </Button>
        <p role="status" className="m-0 text-sm">
          {statusText(pending, result)}
        </p>
      </div>
      {listed.length === 0 ? null : (
        <ul role="alert" className="mt-2 list-disc pl-5 text-sm text-status-failed-fg">
          {listed.map(([path, message]) => (
            <li key={path}>{`${words(path)}: ${message}`}</li>
          ))}
        </ul>
      )}
    </form>
  )
}
