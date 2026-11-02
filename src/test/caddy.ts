import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers'

export const CADDY_TEST_IMAGE =
  'caddy:2.10@sha256:c3d7ee5d2b11f9dc54f947f68a734c84e9c9666c92c88a7f30b9cba5da182adb'

const CADDYFILE = fileURLToPath(new URL('../../deploy/Caddyfile', import.meta.url))
const HTTP_PORT = 80
const LOG_DRAIN_MS = 800

export function testCaddyfile(upstreamPort: number, options: { withLogSkip: boolean }): string {
  const source = readFileSync(CADDYFILE, 'utf8')
  const withoutS3 = source.slice(0, source.indexOf('s3.{$APP_DOMAIN}')).trimEnd()
  const skipLine = '\tlog_skip @anonymousIntake\n'
  const body = options.withLogSkip ? withoutS3 : withoutS3.replace(skipLine, '')
  return `${body}\n`
    .replaceAll('{$APP_DOMAIN}', ':80')
    .replaceAll('app:3000', `host.docker.internal:${upstreamPort}`)
}

export interface RunningCaddy {
  url: string
  logs(): Promise<string>
  stop(): Promise<void>
}

export async function startCaddy(
  upstreamPort: number,
  options: { withLogSkip: boolean } = { withLogSkip: true },
): Promise<RunningCaddy> {
  const container: StartedTestContainer = await new GenericContainer(CADDY_TEST_IMAGE)
    .withExposedPorts(HTTP_PORT)
    .withExtraHosts([{ host: 'host.docker.internal', ipAddress: 'host-gateway' }])
    .withCopyContentToContainer([
      { content: testCaddyfile(upstreamPort, options), target: '/etc/caddy/Caddyfile' },
    ])
    .withWaitStrategy(Wait.forLogMessage(/serving initial configuration/))
    .start()
  return {
    url: `http://${container.getHost()}:${container.getMappedPort(HTTP_PORT)}`,
    async logs() {
      const stream = await container.logs()
      const chunks: Buffer[] = []
      stream.on('data', (chunk: Buffer | string) => chunks.push(Buffer.from(chunk)))
      await new Promise((resolve) => setTimeout(resolve, LOG_DRAIN_MS))
      stream.destroy()
      return Buffer.concat(chunks).toString('utf8')
    },
    async stop() {
      await container.stop()
    },
  }
}
