import { fileURLToPath } from 'node:url'
import { GenericContainer, Wait } from 'testcontainers'
import { AppError, ErrorIds } from '../constants/errorIds.ts'
import { GARAGE_IMAGE } from '../constants/infra.ts'
import { prepareBucket } from '../features/storage/prepareBucket.ts'

export interface ObjectStoreTestConfig {
  endpoint: string
  publicEndpoint: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  region: string
  adminEndpoint: string
  adminToken: string
}

const GARAGE_CONFIG = fileURLToPath(new URL('../../deploy/garage.toml', import.meta.url))
const ACCESS_KEY_ID = 'chiban-test'
const SECRET_ACCESS_KEY = 'chiban-test-secret'
const ADMIN_TOKEN = 'chiban-test-admin-token'
const RPC_SECRET = '0'.repeat(63).concat('1')
export const TEST_BROWSER_ORIGIN = 'http://localhost:3000'
const S3_PORT = 3900
const ADMIN_PORT = 3903

export async function startObjectStore(): Promise<{
  config: ObjectStoreTestConfig
  stop(): Promise<void>
}> {
  const container = await new GenericContainer(GARAGE_IMAGE)
    .withCopyFilesToContainer([{ source: GARAGE_CONFIG, target: '/etc/garage.toml' }])
    .withEnvironment({
      GARAGE_RPC_SECRET: RPC_SECRET,
      GARAGE_ADMIN_TOKEN: ADMIN_TOKEN,
      GARAGE_DEFAULT_ACCESS_KEY: ACCESS_KEY_ID,
      GARAGE_DEFAULT_SECRET_KEY: SECRET_ACCESS_KEY,
    })
    .withCommand(['/garage', 'server', '--single-node', '--default-access-key'])
    .withExposedPorts(S3_PORT, ADMIN_PORT)
    .withWaitStrategy(Wait.forHttp('/health', ADMIN_PORT).forStatusCode(200))
    .start()
  const host = container.getHost()
  const endpoint = `http://${host}:${container.getMappedPort(S3_PORT)}`
  const config = {
    endpoint,
    publicEndpoint: endpoint,
    bucket: 'chiban-test',
    accessKeyId: ACCESS_KEY_ID,
    secretAccessKey: SECRET_ACCESS_KEY,
    region: 'us-east-1',
    adminEndpoint: `http://${host}:${container.getMappedPort(ADMIN_PORT)}`,
    adminToken: ADMIN_TOKEN,
  }
  const prepared = await prepareBucket(
    config,
    { endpoint: config.adminEndpoint, token: ADMIN_TOKEN },
    [TEST_BROWSER_ORIGIN],
    AbortSignal.timeout(30_000),
  )
  if (!prepared.ok) {
    await container.stop()
    throw new AppError(ErrorIds.CFG_MISSING, 'test bucket setup failed', { ...prepared.error })
  }
  return {
    config,
    stop: async () => {
      await container.stop()
    },
  }
}
