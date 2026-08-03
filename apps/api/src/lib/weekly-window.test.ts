import { describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { currentWeekStartUtc } from './weekly-window.js';

/**
 * The whole point of computing this in America/New_York and converting to
 * UTC at query time (rather than storing a UTC offset) is that it stays
 * correct across DST transitions. These cases pin the UTC offset (-04:00
 * EDT vs -05:00 EST) on both sides of the spring-forward/fall-back
 * boundaries, including the transition day itself, where a fixed-offset
 * shortcut would get the wrong answer for "midnight" on that date.
 */
describe('currentWeekStartUtc', () => {
  it('during EDT (daylight time), converts Sunday midnight ET at UTC-4', () => {
    const now = DateTime.fromISO('2026-06-17T15:00:00', { zone: 'America/New_York' }); // Wednesday
    expect(currentWeekStartUtc(now).toISOString()).toBe('2026-06-14T04:00:00.000Z');
  });

  it('during EST (standard time), converts Sunday midnight ET at UTC-5', () => {
    const now = DateTime.fromISO('2026-01-14T15:00:00', { zone: 'America/New_York' }); // Wednesday
    expect(currentWeekStartUtc(now).toISOString()).toBe('2026-01-11T05:00:00.000Z');
  });

  it('handles "now" a couple of days after fall-back (clocks moved back Nov 1, 2026 at 2am)', () => {
    // The week's Sunday (Nov 1) starts in EDT — DST doesn't end until 2am
    // that day — so midnight on Nov 1 is still UTC-4, not UTC-5.
    const now = DateTime.fromISO('2026-11-03T10:00:00', { zone: 'America/New_York' }); // Tuesday
    expect(currentWeekStartUtc(now).toISOString()).toBe('2026-11-01T04:00:00.000Z');
  });

  it('handles "now" a couple of days after spring-forward (clocks moved forward Mar 8, 2026 at 2am)', () => {
    // The week's Sunday (Mar 8) starts in EST — the jump to EDT doesn't
    // happen until 2am that day — so midnight on Mar 8 is still UTC-5.
    const now = DateTime.fromISO('2026-03-10T10:00:00', { zone: 'America/New_York' }); // Tuesday
    expect(currentWeekStartUtc(now).toISOString()).toBe('2026-03-08T05:00:00.000Z');
  });

  it('treats a Sunday itself as the start of its own week', () => {
    const now = DateTime.fromISO('2026-06-14T08:00:00', { zone: 'America/New_York' }); // Sunday
    expect(currentWeekStartUtc(now).toISOString()).toBe('2026-06-14T04:00:00.000Z');
  });
});
