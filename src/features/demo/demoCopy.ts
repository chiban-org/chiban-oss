export const DEMO_REFUSAL =
  'The demo does not allow this, because it would change the demo for every visitor. It works in a real installation.'

export function demoNoticeFor(resetAt: string): string {
  return `This is a demo. The data resets every night at ${resetAt}, and mail is not delivered.`
}
