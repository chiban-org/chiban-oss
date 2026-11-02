import { MinioContainer } from '@testcontainers/minio'
import { MINIO_IMAGE } from '../constants/infra.ts'

export interface MinioTestConfig {
  endpoint: string
  publicEndpoint: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  region: string
}

const USERNAME = 'chiban'
const PASSWORD = 'chiban-test-secret'
const CORS_ORIGIN = 'http://localhost:3000'
const API_PORT = 9000

export async function startMinio(): Promise<{
  config: MinioTestConfig
  stop(): Promise<void>
}> {
  const container = await new MinioContainer(MINIO_IMAGE)
    .withUsername(USERNAME)
    .withPassword(PASSWORD)
    .withEnvironment({ MINIO_API_CORS_ALLOW_ORIGIN: CORS_ORIGIN })
    .start()
  const endpoint = `http://${container.getHost()}:${container.getMappedPort(API_PORT)}`
  return {
    config: {
      endpoint,
      publicEndpoint: endpoint,
      bucket: 'chiban-test',
      accessKeyId: USERNAME,
      secretAccessKey: PASSWORD,
      region: 'us-east-1',
    },
    stop: async () => {
      await container.stop()
    },
  }
}
