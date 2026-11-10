export const DEMO_RESET_AT = '3:00 AM Eastern'

export const DEMO_SERVER_ENV: Readonly<Record<string, string>> = {
  CHIBAN_DEMO_MODE: 'true',
  CHIBAN_DEMO_RESET_AT: DEMO_RESET_AT,
  CHIBAN_DEMO_MAIL_SINK_HOSTS: 'localhost',
  ENABLE_SIMULATED_PAYMENTS: 'true',
}
