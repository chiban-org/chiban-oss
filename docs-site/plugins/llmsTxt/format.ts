export type DocEntry = { title: string; description: string; permalink: string; unlisted?: boolean; draft?: boolean }

export type LlmsTxtInput = {
  siteUrl: string
  trailingSlash: boolean
  title: string
  summary: string
  details: string[]
  sections: { folders: string[]; label: string }[]
  links: { label: string; href: string; note: string }[]
  docs: DocEntry[]
}

const sectionFolder = (permalink: string) => permalink.split('/').filter(Boolean)[0] ?? ''

export function formatLlmsTxt(input: LlmsTxtInput): string {
  const visible = input.docs.filter((doc) => !doc.unlisted && !doc.draft)
  const known = new Set(input.sections.flatMap((section) => section.folders))
  const leftover = [...new Set(visible.map((doc) => sectionFolder(doc.permalink)))]
    .filter((folder) => !known.has(folder))
    .sort()
    .map((folder) => ({ folders: [folder], label: folder ? folder.replace(/-/g, ' ') : 'Overview' }))
  const pagePath = (permalink: string) =>
    input.trailingSlash && !permalink.endsWith('/') ? `${permalink}/` : permalink
  const lines = (docs: DocEntry[]) =>
    [...docs]
      .sort((a, b) => a.permalink.localeCompare(b.permalink))
      .map((doc) => `- [${doc.title}](${new URL(pagePath(doc.permalink), input.siteUrl).href})${doc.description ? `: ${doc.description}` : ''}`)
  const sections = [...input.sections, ...leftover].flatMap((section) => {
    const docs = visible.filter((doc) => section.folders.includes(sectionFolder(doc.permalink)))
    return docs.length ? [`## ${section.label}`, '', ...lines(docs), ''] : []
  })
  return [
    `# ${input.title}`,
    '',
    `> ${input.summary}`,
    '',
    ...input.details.flatMap((detail) => [detail, '']),
    ...sections,
    '## Elsewhere',
    '',
    ...input.links.map((link) => `- [${link.label}](${link.href}): ${link.note}`),
    '',
  ].join('\n')
}
