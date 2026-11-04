import { screen } from '@testing-library/react'
import { useState } from 'react'
import { FormBuilder } from '@/components/config/formBuilder/FormBuilder'
import type { FormBuilderData } from '@/features/forms/formReferences'
import type { FormBody } from '@/features/forms/formSchema'

export function Harness({
  initial,
  data = { frozenKeys: [], externalUses: [] },
}: {
  initial: FormBody
  data?: FormBuilderData
}) {
  const [body, setBody] = useState(initial)
  return (
    <>
      <FormBuilder body={body} onChange={setBody} errors={{}} data={data} />
      <output data-testid="state">{JSON.stringify(body)}</output>
    </>
  )
}

export function stateBody(): FormBody {
  return JSON.parse(screen.getByTestId('state').textContent) as FormBody
}
