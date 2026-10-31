import { describe, it, expect, beforeEach } from 'vitest';
import {
  ACTIVE_WORKOUT_KEY,
  loadSavedWorkoutSession,
  saveActiveWorkoutSession,
} from '../pages/TrainPage';

// In-memory localStorage mock for node test environments where localStorage is mocked or absent
class MockLocalStorage {
  constructor() {
    this.store = {};
  }
  getItem(key) {
    return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null;
  }
  setItem(key, value) {
    this.store[key] = String(value);
  }
  removeItem(key) {
    delete this.store[key];
  }
  clear() {
    this.store = {};
  }
}

describe('Active Workout Persistence (Bug 1)', () => {
  let mockStorage;

  beforeEach(() => {
    mockStorage = new MockLocalStorage();
    // Stub global localStorage
    Object.defineProperty(globalThis, 'localStorage', {
      value: mockStorage,
      configurable: true,
      writable: true,
    });
    // Ensure window.localStorage is also defined
    if (typeof window !== 'undefined') {
      Object.defineProperty(window, 'localStorage', {
        value: mockStorage,
        configurable: true,
        writable: true,
      });
    }
  });

  it('uses the specified dedicated localStorage key bm90_active_workout', () => {
    expect(ACTIVE_WORKOUT_KEY).toBe('bm90_active_workout');
  });

  it('returns null when no active workout is saved', () => {
    expect(loadSavedWorkoutSession()).toBeNull();
  });

  it('persists and restores an active workout session with sets, weights, and reps', () => {
    const session = {
      id: 'session_123',
      templateId: 'temp_push',
      name: 'Push Day Alpha',
      date: '2026-10-30',
      startTime: '2026-10-30T10:00:00.000Z',
      endTime: null,
      exercises: [
        {
          exerciseId: 'ex_bench',
          exerciseName: 'Barbell Bench Press',
          sets: [
            { weight: '80', reps: '10', completed: true },
            { weight: '85', reps: '8', completed: true },
            { weight: '90', reps: '5', completed: false },
          ],
        },
      ],
      notes: 'Feeling strong today',
      status: 'active',
    };

    saveActiveWorkoutSession(session);

    // Verify stored under ACTIVE_WORKOUT_KEY
    const rawStored = mockStorage.getItem(ACTIVE_WORKOUT_KEY);
    expect(rawStored).toBeTruthy();
    expect(JSON.parse(rawStored).name).toBe('Push Day Alpha');

    // Verify restore via loadSavedWorkoutSession
    const restored = loadSavedWorkoutSession();
    expect(restored).not.toBeNull();
    expect(restored.id).toBe('session_123');
    expect(restored.exercises[0].sets[0].weight).toBe('80');
    expect(restored.exercises[0].sets[0].completed).toBe(true);
    expect(restored.exercises[0].sets[2].completed).toBe(false);
    expect(restored.notes).toBe('Feeling strong today');
  });

  it('updates persistence when sets are added or modified during workout', () => {
    const session = {
      id: 'session_456',
      name: 'Leg Day Blast',
      status: 'active',
      exercises: [
        {
          exerciseId: 'ex_squat',
          exerciseName: 'Back Squat',
          sets: [{ weight: '100', reps: '5', completed: true }],
        },
      ],
    };

    saveActiveWorkoutSession(session);
    let current = loadSavedWorkoutSession();
    expect(current.exercises[0].sets.length).toBe(1);

    // Add set
    session.exercises[0].sets.push({ weight: '110', reps: '5', completed: true });
    saveActiveWorkoutSession(session);

    current = loadSavedWorkoutSession();
    expect(current.exercises[0].sets.length).toBe(2);
    expect(current.exercises[0].sets[1].weight).toBe('110');
  });

  it('safely handles corrupted or invalid JSON in localStorage', () => {
    mockStorage.setItem(ACTIVE_WORKOUT_KEY, 'invalid-json{{}');
    expect(loadSavedWorkoutSession()).toBeNull();
  });

  it('ignores stored sessions with non-active status or non-array exercises', () => {
    mockStorage.setItem(
      ACTIVE_WORKOUT_KEY,
      JSON.stringify({ id: 's1', status: 'completed', exercises: [] })
    );
    expect(loadSavedWorkoutSession()).toBeNull();

    mockStorage.setItem(
      ACTIVE_WORKOUT_KEY,
      JSON.stringify({ id: 's2', status: 'active', exercises: 'not-an-array' })
    );
    expect(loadSavedWorkoutSession()).toBeNull();
  });

  it('clears active workout key upon explicit discard or completion', () => {
    const session = {
      id: 'session_finish',
      name: 'To Complete',
      status: 'active',
      exercises: [],
    };
    saveActiveWorkoutSession(session);
    expect(mockStorage.getItem(ACTIVE_WORKOUT_KEY)).toBeTruthy();

    // Call with null to clear
    saveActiveWorkoutSession(null);
    expect(mockStorage.getItem(ACTIVE_WORKOUT_KEY)).toBeNull();
    expect(loadSavedWorkoutSession()).toBeNull();
  });
});

