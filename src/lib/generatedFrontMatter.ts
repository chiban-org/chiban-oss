export const DOCS_GENERATE_COMMAND = 'pnpm docs:generate'

export interface GeneratedFrontMatter {
  sources: readonly string[]
  fields?: Readonly<Record<string, string>>
}

function yamlString(value: string): string {
  return JSON.stringify(value)
}

export function generatedFrontMatter({ sources, fields = {} }: GeneratedFrontMatter): string {
  const lines = [
    '---',
    ...Object.entries(fields).map(([key, value]) => `${key}: ${yamlString(value)}`),
    'generated: true',
    `generated_by: ${yamlString(DOCS_GENERATE_COMMAND)}`,
    'generated_from:',
    ...sources.map((source) => `  - ${yamlString(source)}`),
    '---',
    '',
  ]
  return `${lines.join('\n')}\n`
}
