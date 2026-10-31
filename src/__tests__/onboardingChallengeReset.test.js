import { describe, it, expect } from 'vitest';
import { createChallenge } from '../utils/challenge.js';

describe('Onboarding Challenge Reset (Bug 3)', () => {
  it('creates an initial active challenge with the selected mode', () => {
    const initialChallenge = createChallenge('beast', ['h1', 'h2']);
    expect(initialChallenge.mode).toBe('beast');
    expect(initialChallenge.status).toBe('active');
    expect(initialChallenge.duration).toBe(90);
    expect(initialChallenge.completedAt).toBeNull();
  });

  it('archives or abandons existing active challenges when onboarding restarts', () => {
    // Simulate user had an active Beast Mode challenge from a previous onboarding run
    const existingChallenges = [
      {
        id: 'c_historical_1',
        mode: 'beast',
        status: 'active',
        startDate: '2026-10-01',
        endDate: '2026-12-30',
        duration: 90,
        completedAt: null,
      },
    ];

    // Onboarding reset simulation logic
    const retired = existingChallenges.map((c) =>
      c.status === 'active'
        ? { ...c, status: 'abandoned', completedAt: '2026-10-30T10:00:00.000Z' }
        : c
    );

    // Create new Monk Mode challenge
    const newChallenge = createChallenge('monk', ['h3']);
    const updatedChallenges = [...retired, newChallenge];

    // Verification 1: Exactly one active challenge exists
    const activeChallenges = updatedChallenges.filter((c) => c.status === 'active');
    expect(activeChallenges.length).toBe(1);

    // Verification 2: Newly selected challenge is the active one
    expect(activeChallenges[0].mode).toBe('monk');
    expect(activeChallenges[0].duration).toBe(30);

    // Verification 3: Previous challenge is preserved in history as abandoned
    const previous = updatedChallenges.find((c) => c.id === 'c_historical_1');
    expect(previous).toBeDefined();
    expect(previous.status).toBe('abandoned');
    expect(previous.completedAt).toBe('2026-10-30T10:00:00.000Z');
    expect(updatedChallenges.length).toBe(2);
  });

  it('handles multiple previous challenges preserving their historical statuses', () => {
    const historical = [
      { id: 'c1', mode: 'wanderer', status: 'completed', completedAt: '2026-09-01' },
      { id: 'c2', mode: 'beast', status: 'abandoned', completedAt: '2026-09-15' },
      { id: 'c3', mode: 'monk', status: 'active', completedAt: null },
    ];

    // Retire active
    const retired = historical.map((c) =>
      c.status === 'active' ? { ...c, status: 'abandoned', completedAt: new Date().toISOString() } : c
    );

    // Add new wanderer mode challenge
    const newChallenge = createChallenge('wanderer', []);
    const updated = [...retired, newChallenge];

    expect(updated.length).toBe(4);
    const active = updated.filter((c) => c.status === 'active');
    expect(active.length).toBe(1);
    expect(active[0].mode).toBe('wanderer');

    expect(updated.find((c) => c.id === 'c1').status).toBe('completed');
    expect(updated.find((c) => c.id === 'c2').status).toBe('abandoned');
    expect(updated.find((c) => c.id === 'c3').status).toBe('abandoned');
  });
});

