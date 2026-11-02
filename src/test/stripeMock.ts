import { GenericContainer, Wait } from 'testcontainers'

export const STRIPE_MOCK_IMAGE = 'stripe/stripe-mock:v0.206.0'
const STRIPE_MOCK_PORT = 12111

export interface StripeMock {
  apiBase: string
  stop(): Promise<void>
}

export async function startStripeMock(): Promise<StripeMock> {
  const container = await new GenericContainer(STRIPE_MOCK_IMAGE)
    .withExposedPorts(STRIPE_MOCK_PORT)
    .withWaitStrategy(Wait.forListeningPorts())
    .start()
  return {
    apiBase: `http://${container.getHost()}:${container.getMappedPort(STRIPE_MOCK_PORT)}`,
    stop: async () => {
      await container.stop()
    },
  }
}
