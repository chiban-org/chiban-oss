import { type FormEvent, useActionState, useLayoutEffect, useRef } from 'react'

const UNRESTORED_TYPES = new Set(['hidden', 'password', 'submit', 'button', 'reset'])

type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement

function isField(element: Element): element is Field {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  )
}

function restoreFiles(input: HTMLInputElement, files: File[]): void {
  if (typeof DataTransfer === 'undefined' || files.length === 0) return
  const transfer = new DataTransfer()
  for (const file of files) transfer.items.add(file)
  input.files = transfer.files
}

function restoreField(
  field: Field,
  submitted: string[],
  occurrence: number,
  wanted: Map<HTMLInputElement, boolean>,
): void {
  if (field instanceof HTMLSelectElement && field.multiple) {
    for (const option of Array.from(field.options))
      option.selected = submitted.includes(option.value)
    return
  }
  if (field instanceof HTMLInputElement && (field.type === 'checkbox' || field.type === 'radio')) {
    field.checked = submitted.includes(field.value)
    wanted.set(field, field.checked)
    return
  }
  field.value = submitted.at(occurrence) ?? ''
}

function isUnrestored(input: HTMLInputElement): boolean {
  if (input.type === 'password' && input.dataset.restoreOnError === 'true') return false
  return UNRESTORED_TYPES.has(input.type)
}

let restoring = false

export function isRestoringValues(): boolean {
  return restoring
}

function syncCheckboxButton(input: HTMLInputElement, wanted: boolean): void {
  const button = input.previousElementSibling
  if (!(button instanceof HTMLButtonElement) || button.getAttribute('role') !== 'checkbox') return
  if ((button.getAttribute('aria-checked') === 'true') !== wanted) button.click()
}

function syncCheckboxButtonsAfterReset(wanted: Map<HTMLInputElement, boolean>): void {
  if (wanted.size === 0) return
  setTimeout(() => {
    restoring = true
    try {
      for (const [input, on] of wanted) syncCheckboxButton(input, on)
    } finally {
      restoring = false
    }
  }, 0)
}

export function restoreSubmittedValues(
  form: HTMLFormElement,
  entries: [string, FormDataEntryValue][],
): void {
  restoring = true
  try {
    restoreAll(form, entries)
  } finally {
    restoring = false
  }
}

function restoreAll(form: HTMLFormElement, entries: [string, FormDataEntryValue][]): void {
  const seen = new Map<string, number>()
  const wanted = new Map<HTMLInputElement, boolean>()
  for (const element of Array.from(form.elements)) {
    if (!isField(element) || element.name === '') continue
    const occurrence = seen.get(element.name) ?? 0
    seen.set(element.name, occurrence + 1)
    if (element instanceof HTMLInputElement && isUnrestored(element)) continue
    const values = entries.filter(([name]) => name === element.name).map(([, value]) => value)
    if (element instanceof HTMLInputElement && element.type === 'file') {
      restoreFiles(
        element,
        values.filter((value): value is File => typeof value !== 'string' && value.size > 0),
      )
      continue
    }
    restoreField(
      element,
      values.filter((value): value is string => typeof value === 'string'),
      occurrence,
      wanted,
    )
  }
  syncCheckboxButtonsAfterReset(wanted)
}

export function useFormAction<S>(
  reducer: (previous: Awaited<S>, formData: FormData) => Promise<Awaited<S>>,
  initial: Awaited<S>,
  failed: (state: Awaited<S>) => boolean,
) {
  const formRef = useRef<HTMLFormElement>(null)
  const submitted = useRef<[string, FormDataEntryValue][]>([])
  const [state, action, pending] = useActionState(reducer, initial)
  useLayoutEffect(() => {
    if (formRef.current !== null && failed(state)) {
      restoreSubmittedValues(formRef.current, submitted.current)
    }
  }, [state, failed])
  const formProps = {
    ref: formRef,
    action,
    onSubmit: (event: FormEvent<HTMLFormElement>) => {
      submitted.current = Array.from(new FormData(event.currentTarget).entries())
    },
  }
  return { state, pending, formProps }
}
