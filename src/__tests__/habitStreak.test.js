import { describe, it, expect } from 'vitest';
import { getStreak } from '../utils/challenge.js';

describe('Habit Streak Calculation (Bug 1)', () => {
  const habitId = 'habit_workout';
  const today = '2026-10-30';
  const yesterday = '2026-10-29';
  const twoDaysAgo = '2026-10-28';
  const threeDaysAgo = '2026-10-27';
  const fourDaysAgo = '2026-10-26';

  it('returns { current: 0, longest: 0 } when completions are empty', () => {
    expect(getStreak(habitId, [], today)).toEqual({ current: 0, longest: 0 });
    expect(getStreak(habitId, null, today)).toEqual({ current: 0, longest: 0 });
  });

  it('preserves the streak throughout today when completed yesterday but not today', () => {
    const completions = [
      { habitId, date: yesterday },
      { habitId, date: twoDaysAgo },
      { habitId, date: threeDaysAgo },
    ];
    // Completed 3 consecutive days ending yesterday. Today is not completed yet.
    const result = getStreak(habitId, completions, today);
    expect(result.current).toBe(3);
    expect(result.longest).toBe(3);
  });

  it('increments streak correctly when completed today', () => {
    const completions = [
      { habitId, date: today },
      { habitId, date: yesterday },
      { habitId, date: twoDaysAgo },
      { habitId, date: threeDaysAgo },
    ];
    // 4 consecutive days including today
    const result = getStreak(habitId, completions, today);
    expect(result.current).toBe(4);
    expect(result.longest).toBe(4);
  });

  it('breaks the current streak when a full day is missed', () => {
    // Completed two days ago and three days ago, but missed yesterday and today
    const completions = [
      { habitId, date: twoDaysAgo },
      { habitId, date: threeDaysAgo },
    ];
    const result = getStreak(habitId, completions, today);
    expect(result.current).toBe(0);
    // Longest streak from the historical run is preserved
    expect(result.longest).toBe(2);
  });

  it('safely deduplicates multiple completion records on the same day', () => {
    const completions = [
      { habitId, date: today },
      { habitId, date: today }, // duplicate
      { habitId, date: yesterday },
      { habitId, date: yesterday }, // duplicate
    ];
    const result = getStreak(habitId, completions, today);
    expect(result.current).toBe(2);
    expect(result.longest).toBe(2);
  });

  it('accurately calculates longest streak when historical run was longer than current', () => {
    // Historical 5-day streak earlier in the month
    const completions = [
      { habitId, date: '2026-10-01' },
      { habitId, date: '2026-10-02' },
      { habitId, date: '2026-10-03' },
      { habitId, date: '2026-10-04' },
      { habitId, date: '2026-10-05' },
      // Gap: 10-06 to 10-28 not completed
      // Current 2-day streak (yesterday and today)
      { habitId, date: yesterday },
      { habitId, date: today },
    ];
    const result = getStreak(habitId, completions, today);
    expect(result.current).toBe(2);
    expect(result.longest).toBe(5);
  });

  it('ignores completions belonging to other habits', () => {
    const completions = [
      { habitId: 'other_habit', date: today },
      { habitId: 'other_habit', date: yesterday },
      { habitId, date: yesterday },
    ];
    const result = getStreak(habitId, completions, today);
    expect(result.current).toBe(1);
    expect(result.longest).toBe(1);
  });
});

