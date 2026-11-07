type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement

function isControl(element: Element): element is Control {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement
  )
}

function fieldName(control: Control): string {
  const label = control.labels?.[0]
  if (label === undefined) return control.name === '' ? 'A field' : control.name
  const copy = label.cloneNode(true) as HTMLElement
  for (const hidden of copy.querySelectorAll('[aria-hidden="true"]')) hidden.remove()
  return copy.textContent.trim()
}

function reason(control: Control): string {
  const { validity } = control
  if (validity.valueMissing) return 'is required'
  if (control instanceof HTMLInputElement && validity.rangeUnderflow) {
    return `must be ${control.min} or more`
  }
  if (control instanceof HTMLInputElement && validity.rangeOverflow) {
    return `must be ${control.max} or less`
  }
  if (validity.badInput) return 'must be a number'
  if (validity.stepMismatch) return 'must be a whole number'
  return 'is not filled in correctly'
}

export function invalidFieldsText(form: HTMLFormElement): string | null {
  if (form.noValidate) return null
  const problems = [...form.elements]
    .filter(isControl)
    .filter((control) => !control.disabled && !control.validity.valid)
    .map((control) => `${fieldName(control)} ${reason(control)}`)
  if (problems.length === 0) return null
  const lead = problems.length === 1 ? 'Fix this' : 'Fix these'
  return `${lead} before putting it into use: ${problems.join('; ')}.`
}
