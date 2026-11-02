export interface FeeLineLike {
  code: string
  label: string
}

export function feeChoices(
  preview: FeeLineLike[] | null,
  assessments: { lines: FeeLineLike[] }[],
): [string, string][] {
  const lines = preview ?? assessments.flatMap((a) => a.lines)
  const named = new Map<string, string>()
  for (const line of lines) if (!named.has(line.code)) named.set(line.code, line.label)
  return [...named.entries()]
}
