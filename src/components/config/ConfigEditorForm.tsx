'use client'

import { useActionState, useState } from 'react'
import { CsrfField } from '@/components/CsrfField'
import { EditorContextProvider } from '@/components/config/EditorContextProvider'
import { CONFIG_EDITORS } from '@/components/config/editorRegistry'
import { FieldError, type FieldErrors } from '@/components/config/primitives'
import { Button } from '@/components/ui/button'
import { useHydrated } from '@/components/useHydrated'
import type { EditorContext } from '@/features/config/editorContext'
import type { ConfigKind } from '@/features/config/kinds'
import { words } from '@/lib/words'
import type { ActionResult } from '@/server/actionRunner'

interface Props {
  kind: ConfigKind
  configKey: string
  initialBody: unknown
  resetKey: string
  context: EditorContext
  saveAction: (formData: FormData) => Promise<ActionResult>
  publishAction: (formData: FormData) => Promise<ActionResult>
}

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
}: Props) {
  const [body, setBody] = useState<unknown>(initialBody)
  const [seenKey, setSeenKey] = useState(resetKey)
  if (seenKey !== resetKey) {
    setSeenKey(resetKey)
    setBody(initialBody)
  }
  const [result, run, pending] = useActionState(
    async (_previous: ActionResult | null, formData: FormData) =>
      formData.get('intent') === 'publish'
        ? await publishAction(formData)
        : await saveAction(formData),
    null,
  )
  const hydrated = useHydrated()
  const Editor = CONFIG_EDITORS[kind]
  const errors: FieldErrors = result !== null && !result.ok ? (result.fieldErrors ?? {}) : {}
  const listed = Object.entries(errors).filter(([path]) => path !== '_form')
  return (
    <form action={run} className="max-w-4xl">
      <CsrfField />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="key" value={configKey} />
      <input type="hidden" name="body" value={JSON.stringify(body)} />
      <EditorContextProvider value={context}>
        <Editor
          body={body}
          onChange={setBody}
          issues={Object.entries(errors).map(([path, message]) => ({ path, message }))}
        />
      </EditorContextProvider>
      <FieldError errors={errors} name="_form" />
      <div className="mt-4 flex items-center gap-3">
        <Button type="submit" name="intent" value="publish" disabled={pending || !hydrated}>
          Publish
        </Button>
        <Button
          type="submit"
          name="intent"
          value="save"
          variant="outline"
          disabled={pending || !hydrated}
        >
          Save draft
        </Button>
        <p role="status" className="text-sm">
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
