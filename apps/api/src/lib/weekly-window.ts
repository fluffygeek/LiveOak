import { DateTime } from 'luxon';

/**
 * Start of the current technician reporting week: most recent Sunday at
 * midnight America/New_York, converted to UTC. Computed at query time (no
 * stored/materialized snapshot) so it's correct-by-construction across DST —
 * see design plan §2.10.
 */
export function currentWeekStartUtc(now: DateTime = DateTime.now()): Date {
  const nowEt = now.setZone('America/New_York');
  // Luxon weekday: Monday=1 ... Sunday=7. Days back to the most recent Sunday:
  // Sunday itself -> 0, Monday -> 1, ..., Saturday -> 6.
  const daysSinceSunday = nowEt.weekday % 7;
  const startEt = nowEt.minus({ days: daysSinceSunday }).startOf('day');
  return startEt.toUTC().toJSDate();
}
