export function dayCount(n: number): string {
  return `${n} ${n === 1 ? 'day' : 'days'}`
}

export function daysLeftPhrase(daysRemaining: number): string {
  return daysRemaining < 0
    ? `${dayCount(-daysRemaining)} overdue`
    : `${dayCount(daysRemaining)} left`
}
