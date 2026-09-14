// Die Aufbewahrungsfrist des Papierkorbs, an einer Stelle. Die Stores kennen
// keine Uhr -- sie bekommen den fertigen Stichtag herein, damit ihre Tests
// ohne Zeitstellen auskommen.

export const TRASH_RETENTION_DAYS = 30;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Der Zeitpunkt, vor dem Weggeworfenes nicht mehr aufgehoben wird. */
export function cutoffFor(now: Date): string {
  return new Date(now.getTime() - TRASH_RETENTION_DAYS * MS_PER_DAY).toISOString();
}
