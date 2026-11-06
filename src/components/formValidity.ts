const TEXT_NODE = 3

function visibleText(node: Node): string {
  if (node.nodeType === TEXT_NODE) return node.textContent ?? ''
  if (node instanceof Element && node.getAttribute('aria-hidden') === 'true') return ''
  return Array.from(node.childNodes).map(visibleText).join('')
}

const TRAILING_PUNCTUATION = /[.?!:]+$/

function labelOf(element: Element): string {
  const label = (element as HTMLInputElement).labels?.[0]
  if (label === undefined) return element.getAttribute('name') ?? 'a required field'
  return visibleText(label).trim().replace(TRAILING_PUNCTUATION, '')
}

export function invalidFields(form: HTMLFormElement): Element[] {
  return Array.from(form.elements).filter(
    (el) =>
      el instanceof HTMLElement && 'validity' in el && !(el as HTMLInputElement).validity.valid,
  )
}

export function problemMessage(invalid: Element[]): string | null {
  if (invalid.length === 0) return null
  const empty = invalid.filter((el) => (el as HTMLInputElement).validity.valueMissing)
  const wrong = invalid.filter((el) => !(el as HTMLInputElement).validity.valueMissing)
  return [
    empty.length > 0 ? `Fill in: ${empty.map(labelOf).join(', ')}.` : '',
    wrong.length > 0 ? `Check: ${wrong.map(labelOf).join(', ')}.` : '',
  ]
    .filter((part) => part !== '')
    .join(' ')
}

export function clearInvalid(form: HTMLFormElement | null): void {
  if (form === null) return
  for (const el of form.querySelectorAll('[aria-invalid="true"]')) {
    el.removeAttribute('aria-invalid')
    el.removeAttribute('aria-describedby')
  }
}

export function markInvalid(form: HTMLFormElement, invalid: Element[], messageId: string): void {
  clearInvalid(form)
  for (const el of invalid) {
    el.setAttribute('aria-invalid', 'true')
    el.setAttribute('aria-describedby', messageId)
  }
  const first = invalid[0]
  if (first instanceof HTMLElement) first.focus()
}

export function focusFirstRefused(form: HTMLFormElement | null, names: readonly string[]): void {
  if (form === null || names.length === 0) return
  const named = Array.from(form.elements).find(
    (el) =>
      el.getAttribute('aria-hidden') !== 'true' && names.includes(el.getAttribute('name') ?? ''),
  )
  const target = form.querySelector('[aria-invalid="true"]') ?? named
  if (target instanceof HTMLElement) target.focus()
}
