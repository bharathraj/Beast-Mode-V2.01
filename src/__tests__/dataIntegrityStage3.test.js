import { describe, it, expect } from 'vitest';
import { reducer } from '../store/StoreContext';

describe('Stage 3 - Data Integrity & CRUD Operations', () => {
  const baseState = {
    moodLogs: [],
    sleepLogs: [],
    weeklyReviews: [],
    waterEntries: [],
    bodyMeasurements: [],
    savingsGoals: [],
  };

  it('Mood logs: updates existing day record instead of creating duplicates', () => {
    // 1. Initial mood log for 2026-10-31
    const state1 = reducer(baseState, {
      type: 'ADD_MOOD_LOG',
      payload: { id: 'm1', date: '2026-10-31', value: 3, note: 'Normal morning' },
    });
    expect(state1.moodLogs).toHaveLength(1);
    expect(state1.moodLogs[0].value).toBe(3);

    // 2. Logging mood again on the same day should update the existing record
    const state2 = reducer(state1, {
      type: 'ADD_MOOD_LOG',
      payload: { id: 'm2', date: '2026-10-31', value: 5, note: 'Great evening workout!' },
    });
    expect(state2.moodLogs).toHaveLength(1); // No duplicate!
    expect(state2.moodLogs[0].value).toBe(5);
    expect(state2.moodLogs[0].note).toBe('Great evening workout!');

    // 3. Logging for a different day adds a new entry
    const state3 = reducer(state2, {
      type: 'ADD_MOOD_LOG',
      payload: { id: 'm3', date: '2026-11-01', value: 4, note: 'Fresh start' },
    });
    expect(state3.moodLogs).toHaveLength(2);
  });

  it('Sleep logs: updates existing day record instead of creating duplicates', () => {
    // 1. Initial sleep log for 2026-10-31
    const state1 = reducer(baseState, {
      type: 'ADD_SLEEP_LOG',
      payload: { id: 's1', date: '2026-10-31', hours: 7, quality: 'good' },
    });
    expect(state1.sleepLogs).toHaveLength(1);
    expect(state1.sleepLogs[0].hours).toBe(7);

    // 2. Re-logging or adjusting sleep on same day updates record
    const state2 = reducer(state1, {
      type: 'ADD_SLEEP_LOG',
      payload: { id: 's2', date: '2026-10-31', hours: 8.5, quality: 'great' },
    });
    expect(state2.sleepLogs).toHaveLength(1); // No duplicate!
    expect(state2.sleepLogs[0].hours).toBe(8.5);
    expect(state2.sleepLogs[0].quality).toBe('great');
  });

  it('Weekly reviews: upserts by weekStart', () => {
    const weekStart = '2026-10-26';
    const weekEnd = '2026-11-01';

    // 1. Initial weekly review
    const state1 = reducer(baseState, {
      type: 'ADD_WEEKLY_REVIEW',
      payload: {
        id: 'rev_1',
        weekStart,
        weekEnd,
        wentWell: 'Maintained 5am workouts',
        difficult: 'Late night cravings',
        rating: 4,
      },
    });
    expect(state1.weeklyReviews).toHaveLength(1);
    expect(state1.weeklyReviews[0].wentWell).toBe('Maintained 5am workouts');

    // 2. Resaving weekly review for same weekStart updates existing record
    const state2 = reducer(state1, {
      type: 'ADD_WEEKLY_REVIEW',
      payload: {
        id: 'rev_2',
        weekStart,
        weekEnd,
        wentWell: 'Maintained 5am workouts and added Sunday prep',
        difficult: 'Late night cravings solved with herbal tea',
        rating: 5,
      },
    });
    expect(state2.weeklyReviews).toHaveLength(1); // No duplicate review!
    expect(state2.weeklyReviews[0].rating).toBe(5);
    expect(state2.weeklyReviews[0].wentWell).toContain('Sunday prep');

    // 3. Different week adds a separate review
    const state3 = reducer(state2, {
      type: 'ADD_WEEKLY_REVIEW',
      payload: {
        id: 'rev_3',
        weekStart: '2026-11-02',
        weekEnd: '2026-11-08',
        wentWell: 'Next week kickoff',
        rating: 4,
      },
    });
    expect(state3.weeklyReviews).toHaveLength(2);
  });

  it('Water tracking: adds and deletes individual water entries', () => {
    // 1. Add two water entries
    const state1 = reducer(baseState, {
      type: 'ADD_WATER_ENTRY',
      payload: { id: 'w1', date: '2026-10-31', amount: 250, unit: 'ml' },
    });
    const state2 = reducer(state1, {
      type: 'ADD_WATER_ENTRY',
      payload: { id: 'w2', date: '2026-10-31', amount: 500, unit: 'ml' },
    });
    expect(state2.waterEntries).toHaveLength(2);

    // 2. Delete one individual entry
    const state3 = reducer(state2, {
      type: 'DELETE_WATER_ENTRY',
      payload: 'w1',
    });
    expect(state3.waterEntries).toHaveLength(1);
    expect(state3.waterEntries[0].id).toBe('w2');
    expect(state3.waterEntries[0].amount).toBe(500);
  });

  it('Body measurements: adds, updates, and deletes records', () => {
    // 1. Add measurement
    const state1 = reducer(baseState, {
      type: 'ADD_BODY_MEASUREMENT',
      payload: { id: 'bm1', date: '2026-10-01', weight: 80, waist: 88, unit: 'kg' },
    });
    expect(state1.bodyMeasurements).toHaveLength(1);

    // 2. Update measurement
    const state2 = reducer(state1, {
      type: 'UPDATE_BODY_MEASUREMENT',
      payload: { id: 'bm1', weight: 79.5, waist: 86.5 },
    });
    expect(state2.bodyMeasurements).toHaveLength(1);
    expect(state2.bodyMeasurements[0].weight).toBe(79.5);
    expect(state2.bodyMeasurements[0].waist).toBe(86.5);

    // 3. Delete measurement
    const state3 = reducer(state2, {
      type: 'DELETE_BODY_MEASUREMENT',
      payload: 'bm1',
    });
    expect(state3.bodyMeasurements).toHaveLength(0);
  });

  it('Savings goals: adds, updates, and deletes goals', () => {
    // 1. Add goal
    const state1 = reducer(baseState, {
      type: 'ADD_SAVINGS_GOAL',
      payload: { id: 'sg1', name: 'Emergency Runway', target: 10000, current: 2000 },
    });
    expect(state1.savingsGoals).toHaveLength(1);

    // 2. Update goal
    const state2 = reducer(state1, {
      type: 'UPDATE_SAVINGS_GOAL',
      payload: { id: 'sg1', target: 12000, current: 3500 },
    });
    expect(state2.savingsGoals).toHaveLength(1);
    expect(state2.savingsGoals[0].target).toBe(12000);
    expect(state2.savingsGoals[0].current).toBe(3500);

    // 3. Delete goal
    const state3 = reducer(state2, {
      type: 'DELETE_SAVINGS_GOAL',
      payload: 'sg1',
    });
    expect(state3.savingsGoals).toHaveLength(0);
  });
});

