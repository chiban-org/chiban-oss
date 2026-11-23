import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { LoadContext, Plugin } from '@docusaurus/types'
import { type DocEntry, formatLlmsTxt, type LlmsTxtInput } from './format'

type Options = Omit<LlmsTxtInput, 'siteUrl' | 'trailingSlash' | 'docs'>

type DocsContent = { loadedVersions: { docs: DocEntry[] }[] }

export default function llmsTxtPlugin(context: LoadContext, options: Options): Plugin {
  let docs: DocEntry[] = []
  return {
    name: 'llms-txt',
    allContentLoaded({ allContent }) {
      const docsPlugin = allContent['docusaurus-plugin-content-docs'] as Record<string, DocsContent> | undefined
      docs = Object.values(docsPlugin ?? {}).flatMap((instance) => instance.loadedVersions.flatMap((version) => version.docs))
    },
    async postBuild({ outDir }) {
      if (docs.length === 0) throw new Error('llms-txt: no docs were loaded')
      const body = formatLlmsTxt({ ...options, siteUrl: context.siteConfig.url, trailingSlash: context.siteConfig.trailingSlash === true, docs })
      await writeFile(join(outDir, 'llms.txt'), body, 'utf8')
    },
  }
}
