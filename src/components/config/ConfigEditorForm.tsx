'use client'

import { useActionState, useState } from 'react'
import { CsrfField } from '@/components/CsrfField'
import { EditorContextProvider } from '@/components/config/EditorContextProvider'
import { CONFIG_EDITORS } from '@/components/config/editorRegistry'
import { type DiscardOffer, PublishBar } from '@/components/config/PublishBar'
import { FieldError, type FieldErrors } from '@/components/config/primitives'
import { RequiredNote } from '@/components/ui/required-mark'
import { useHydrated } from '@/components/useHydrated'
import type { EditorContext } from '@/features/config/editorContext'
import { type ConfigKind, isPinnedKind } from '@/features/config/kinds'
import type { ActionResult } from '@/server/actionRunner'

interface Props {
  kind: ConfigKind
  configKey: string
  initialBody: unknown
  resetKey: string
  context: EditorContext
  saveAction: (formData: FormData) => Promise<ActionResult>
  publishAction: (formData: FormData) => Promise<ActionResult>
  discard?: DiscardOffer & { action: (formData: FormData) => Promise<ActionResult> }
}

const BUILDER_KINDS: ReadonlySet<ConfigKind> = new Set(['form', 'template'])

function statusText(pending: boolean, result: ActionResult | null): string | null {
  if (pending) return 'Working'
  if (result === null) return null
  return result.ok ? result.message : result.error
}

export function ConfigEditorForm({
  kind,
  configKey,
  initialBody,
  resetKey,
  context,
  saveAction,
  publishAction,
  discard,
}: Props) {
  const [body, setBody] = useState<unknown>(initialBody)
  const [seenKey, setSeenKey] = useState(resetKey)
  if (seenKey !== resetKey) {
    setSeenKey(resetKey)
    setBody(initialBody)
  }
  const [result, run, pending] = useActionState(
    async (_previous: ActionResult | null, formData: FormData) => {
      const intent = formData.get('intent')
      if (intent === 'discard' && discard !== undefined) return await discard.action(formData)
      return intent === 'publish' ? await publishAction(formData) : await saveAction(formData)
    },
    null,
  )
  const hydrated = useHydrated()
  const [dismissed, setDismissed] = useState<ActionResult | null>(null)
  const edit = (next: unknown) => {
    setBody(next)
    setDismissed(result)
  }
  const Editor = CONFIG_EDITORS[kind]
  const refused = result !== null && !result.ok && result !== dismissed
  const errors: FieldErrors = refused ? (result.fieldErrors ?? {}) : {}
  const listed = Object.entries(errors).filter(([path]) => path !== '_form')
  return (
    <form
      action={run}
      noValidate={BUILDER_KINDS.has(kind)}
      className={BUILDER_KINDS.has(kind) ? undefined : 'max-w-4xl'}
    >
      <RequiredNote className="mb-5" />
      <CsrfField />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="key" value={configKey} />
      <input type="hidden" name="body" value={JSON.stringify(body)} />
      <EditorContextProvider value={context}>
        <Editor
          body={body}
          onChange={edit}
          issues={Object.entries(errors).map(([path, message]) => ({ path, message }))}
        />
      </EditorContextProvider>
      <FieldError errors={errors} name="_form" />
      <PublishBar
        pinned={isPinnedKind(kind)}
        disabled={pending || !hydrated}
        status={statusText(pending, refused || result?.ok === true ? result : null)}
        {...(discard === undefined ? {} : { discard })}
      />
      {listed.length === 0 ? null : (
        <ul role="alert" className="mt-2 list-disc pl-5 text-sm text-status-failed-fg">
          {listed.map(([path, message]) => (
            <li key={path}>{message}</li>
          ))}
        </ul>
      )}
    </form>
  )
}
