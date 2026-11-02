import { startCloverFakeServer } from '@/test/fakes/cloverFakeServer'
import closed from '@/test/fixtures/clover/payment_success_closed.json'

const DEFAULT_TOKEN = 'clover_dev_token'
const DEFAULT_MERCHANT = 'MERCHANT1ALDER'

const server = await startCloverFakeServer({
  token: DEFAULT_TOKEN,
  merchantId: DEFAULT_MERCHANT,
})
server.setPayment(closed.id, closed)
console.warn(`Clover fake server: ${server.apiBase}`)
console.warn('This is a local stand-in with hand-made fixtures, not Clover.')

for (const event of ['SIGINT', 'SIGTERM'] as const) {
  process.on(event, () => {
    void server.stop().then(() => process.exit(0))
  })
}
