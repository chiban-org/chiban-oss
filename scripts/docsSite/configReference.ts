import { z } from 'zod'
import { ENV_DOC_GROUPS, ENV_DOCS } from '@/config/envDocs'
import { ENV_RULES, type EnvSetting, envSchema } from '@/config/envSchema'
import { ENV_PREFIXES_STRICT } from '@/config/envStrict'
import { generatedFrontMatter } from '@/lib/generatedFrontMatter'
import { code, escapeText, joinBlocks, listInWords } from './markdown'

export const CONFIG_REFERENCE_PATH = 'docs-site/docs/reference/configuration.md'

interface InputSchema {
  type?: string
  enum?: readonly unknown[]
  format?: string
  minLength?: number
  maxLength?: number
  pattern?: string
}

function inputSchemaOf(schema: z.ZodType): InputSchema {
  return z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as InputSchema
}

function lengthText(input: InputSchema): string {
  const { minLength, maxLength } = input
  if (minLength !== undefined && minLength > 1 && maxLength !== undefined) {
    return `, ${minLength} to ${maxLength} characters`
  }
  if (maxLength !== undefined) return `, up to ${maxLength} characters`
  if (minLength !== undefined && minLength > 1) return `, at least ${minLength} characters`
  return ''
}

function typeText(input: InputSchema, parsedDefault: unknown): string {
  if (input.enum !== undefined) {
    return `Accepts ${listInWords(
      input.enum.map((v) => code(String(v))),
      'or',
    )}`
  }
  if (input.type === 'integer') return 'Whole number greater than zero'
  if (Array.isArray(parsedDefault)) return 'Comma-separated list'
  if (input.format === 'uri') return 'URL'
  if (input.pattern !== undefined) return `Text matching ${code(input.pattern)}`
  return `Text${lengthText(input)}`
}

function defaultText(parsedDefault: unknown): string {
  if (Array.isArray(parsedDefault)) {
    return parsedDefault.length === 0 ? 'empty' : code(parsedDefault.join(','))
  }
  return code(String(parsedDefault))
}

function settingBlock(setting: EnvSetting): string {
  const schema = envSchema.shape[setting] as z.ZodType
  const parsed = schema.safeParse(undefined)
  const input = inputSchemaOf(schema)
  const status = !parsed.success
    ? 'Required.'
    : parsed.data === undefined
      ? 'Optional. No default.'
      : `Optional. Default: ${defaultText(parsed.data)}.`
  const rules = ENV_RULES.filter((rule) => rule.setting === setting).map(
    (rule) => `- ${code(setting)} ${escapeText(rule.message)}.`,
  )
  return joinBlocks([
    `### ${code(setting)}`,
    `${status} ${typeText(input, parsed.success ? parsed.data : undefined)}.`,
    ENV_DOCS[setting].text,
    rules.join('\n'),
  ]).trimEnd()
}

const INTRO = [
  'This page is for whoever runs the Chiban server. It lists every setting the application, the worker and the command-line tools read from their environment.',
  `Chiban checks these settings when it starts and refuses to start when one is invalid. It also refuses to start when it finds a setting whose name begins with one of its own prefixes and that it does not recognise, so a misspelled setting is reported instead of ignored. The prefixes are ${listInWords(ENV_PREFIXES_STRICT.map(code))}.`,
  'For development, the settings go in `.env` at the repository root, copied from `.env.example`. The bundled deployment passes only the settings listed in `deploy/docker-compose.yml` to the application, the worker and the migration step. To use any other setting there, add it to those services. The guide to [self-hosting](../operations/self-hosting.md) covers the deployment settings, such as `APP_DOMAIN` and `POSTGRES_PASSWORD`, that only the Compose file reads.',
]

export function renderConfigReference(): string {
  const settings = Object.keys(ENV_DOCS) as EnvSetting[]
  const groups = ENV_DOC_GROUPS.map((group) => {
    const members = settings.filter((setting) => ENV_DOCS[setting].group === group.key)
    return joinBlocks([`## ${group.title}`, ...members.map(settingBlock)]).trimEnd()
  })
  const frontMatter = generatedFrontMatter({
    sources: ['src/config/envSchema.ts', 'src/config/envDocs.ts', 'src/config/envStrict.ts'],
    fields: {
      title: 'Configuration',
      description: 'Every setting Chiban reads from its environment.',
    },
  })
  return `${frontMatter}${joinBlocks(['# Configuration', ...INTRO, ...groups])}`
}
