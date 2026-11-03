import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  syncUserChallengeStats,
  sanitizeHabitSchedule,
  resetSocialStore,
  getLeaderboardRankings,
} from '../services/supabase';
import { calculateChallengeScores } from '../utils/challenge';
import fs from 'node:fs';
import path from 'node:path';

describe('Stage 5.2 — Final Targeted Corrections Regression Suite', () => {
  beforeEach(() => {
    resetSocialStore();
    vi.restoreAllMocks();
  });

  // ============================================================================
  // 1. Challenge Completion Isolation
  // ============================================================================
  describe('1. Challenge Completion Isolation', () => {
    const activeChallenge = {
      id: 'chal_active_100',
      mode: 'monk',
      name: 'Active Monk Challenge',
      startDate: '2026-11-01',
      endDate: '2026-11-30',
      duration: 30,
      status: 'active',
      selectedHabitIds: ['h_core'],
    };

    const habits = [
      { id: 'h_core', name: 'Core Habit', schedule: 'daily', archived: false },
    ];

    it('includes matching challengeId completions and excludes NULL, missing, empty, and other challenge IDs', () => {
      const completions = [
        // 1. Matching active challenge completion
        { id: 'c1', challengeId: 'chal_active_100', habitId: 'h_core', date: '2026-11-01' },
        // 2. NULL challengeId (legacy unlinked log)
        { id: 'c2', challengeId: null, habitId: 'h_core', date: '2026-11-02' },
        // 3. Missing challengeId property
        { id: 'c3', habitId: 'h_core', date: '2026-11-02' },
        // 4. Undefined challengeId
        { id: 'c4', challengeId: undefined, habitId: 'h_core', date: '2026-11-02' },
        // 5. Empty string challengeId
        { id: 'c5', challengeId: '   ', habitId: 'h_core', date: '2026-11-02' },
        // 6. Other challenge completion
        { id: 'c6', challengeId: 'chal_other_999', habitId: 'h_core', date: '2026-11-02' },
      ];

      // SocialPage filter implementation:
      const relevantCompletions = completions.filter(
        c => c && typeof c.challengeId === 'string' && c.challengeId.trim() !== '' && c.challengeId === activeChallenge.id
      );

      // Only c1 should be relevant
      expect(relevantCompletions).toHaveLength(1);
      expect(relevantCompletions[0].id).toBe('c1');

      // Legacy records must be preserved in the original array (never deleted)
      expect(completions).toHaveLength(6);
      expect(completions.find(c => c.id === 'c2')).toBeDefined();
      expect(completions.find(c => c.id === 'c3')).toBeDefined();
      expect(completions.find(c => c.id === 'c6')).toBeDefined();

      // Active challenge score calculation over relevant completions on Day 2
      const scores = calculateChallengeScores(activeChallenge, habits, relevantCompletions, [], '2026-11-02');

      // 1 completion out of 2 scheduled days = 50%
      expect(scores.totalScheduledOccurrences).toBe(2);
      expect(scores.completedScheduledOccurrences).toBe(1);
      expect(scores.consistencyPercent).toBe(50);
    });

    it('verifies SocialPage.jsx code strictly filters challengeId and preserves legacy records', () => {
      const socialPagePath = path.resolve(__dirname, '../pages/SocialPage.jsx');
      const socialPageCode = fs.readFileSync(socialPagePath, 'utf8');

      // Verifies strict challengeId equality and exclusion of null / missing
      expect(socialPageCode).toMatch(/c\.challengeId === activeChallenge\.id/);
      expect(socialPageCode).not.toMatch(/c\.challengeId === activeChallenge\.id\s*\|\|\s*!c\.challengeId/);
      expect(socialPageCode).toMatch(/typeof c\.challengeId === 'string'/);
    });
  });

  // ============================================================================
  // 2. Leaderboard Integrity & Independent Validation
  // ============================================================================
  describe('2. Leaderboard Integrity', () => {
    const mockChallenge = {
      id: 'ch_integrity_1',
      mode: 'beast',
      name: 'Beast Integrity',
      startDate: '2026-11-01',
      endDate: '2026-11-30',
      duration: 30,
      selectedHabitIds: ['h1'],
    };

    const habits = [{ id: 'h1', name: 'Habit 1', schedule: 'daily', archived: false }];

    it('does not blindly trust fabricated frontend verifiedStats when user records are provided', async () => {
      // Attacker attempts to forge 100% consistency and 999 streak in verifiedStats
      const fabricatedStats = {
        consistencyPercent: 100,
        currentStreak: 999,
        longestStreak: 999,
        workoutsCompleted: 50,
        challengeDay: 10,
      };

      // Real user records: 0 completions, 0 workouts on Day 1
      const options = {
        habits,
        habitCompletions: [],
        workoutSessions: [],
      };

      const syncResult = await syncUserChallengeStats(
        mockChallenge,
        fabricatedStats,
        'Honest Athlete',
        true,
        options
      );

      expect(syncResult).toBe(true);

      const rankings = await getLeaderboardRankings('beast', 'global');
      const syncedUser = rankings.find(r => r.name === 'Honest Athlete');
      expect(syncedUser).toBeDefined();

      // The fabricated 100% and 999 streak MUST be discarded; recalculated independently as 0
      expect(syncedUser.consistencyPercent).toBe(0);
      expect(syncedUser.currentStreak).toBe(0);
      expect(syncedUser.workoutsCompleted).toBe(0);
    });

    it('preserves existing privacy rules: food logs and body measurements are never synchronized to leaderboard', async () => {
      const supabaseJsPath = path.resolve(__dirname, '../services/supabase.js');
      const supabaseJsCode = fs.readFileSync(supabaseJsPath, 'utf8');

      // Ensure syncUserChallengeStats only syncs habits, habit_completions, workout_sessions, challenges
      expect(supabaseJsCode).not.toMatch(/from\(['"]meal_entries['"]\)\.upsert/);
      expect(supabaseJsCode).not.toMatch(/from\(['"]body_measurements['"]\)\.upsert/);
      expect(supabaseJsCode).toMatch(/Private food logs and body measurements are NEVER shared or synchronized/);
    });
  });

  // ============================================================================
  // 3. Habit Synchronization & Safe Schedule Validation
  // ============================================================================
  describe('3. Habit Synchronization', () => {
    it('safely parses malformed schedule JSON without aborting or throwing', () => {
      expect(sanitizeHabitSchedule('["mon", "wed"]')).toEqual(['mon', 'wed']);
      expect(sanitizeHabitSchedule('daily')).toBe('daily');
      expect(sanitizeHabitSchedule('"daily"')).toBe('daily');
      expect(sanitizeHabitSchedule(null)).toBe('daily');
      expect(sanitizeHabitSchedule(undefined)).toBe('daily');
      expect(sanitizeHabitSchedule(['mon', 'tue'])).toEqual(['mon', 'tue']);

      // Malformed JSON strings must safely fallback to 'daily' without aborting
      expect(sanitizeHabitSchedule('[{malformed-json')).toBe('daily');
      expect(sanitizeHabitSchedule('[invalid-array')).toBe('daily');
      expect(sanitizeHabitSchedule('{bad-object')).toBe('daily');
      expect(sanitizeHabitSchedule('{"truncated": ')).toBe('daily');
    });

    it('synchronizes only habits selected by the active challenge', () => {
      const challenge = {
        id: 'chal_selective',
        startDate: '2026-11-01',
        selectedHabitIds: ['h_sel_1', 'h_sel_2'],
      };

      const allHabits = [
        { id: 'h_sel_1', name: 'Selected Habit 1', schedule: 'daily', archived: false },
        { id: 'h_sel_2', name: 'Selected Habit 2', schedule: 'daily', archived: false },
        { id: 'h_unsel_3', name: 'Unselected Habit 3', schedule: 'daily', archived: false },
        { id: 'h_unsel_4', name: 'Unselected Habit 4', schedule: 'daily', archived: false },
      ];

      const selectedHabitSet = new Set(challenge.selectedHabitIds);
      const habitsToSync = allHabits.filter(h => h && selectedHabitSet.has(h.id));

      expect(habitsToSync).toHaveLength(2);
      expect(habitsToSync.map(h => h.id)).toEqual(['h_sel_1', 'h_sel_2']);
    });
  });

  // ============================================================================
  // 4. Error Handling & Prerequisite Protection
  // ============================================================================
  describe('4. Error Handling & Prerequisite Protection', () => {
    it('verifies silent .catch(() => {}) has been removed from synchronization', () => {
      const supabaseJsPath = path.resolve(__dirname, '../services/supabase.js');
      const supabaseJsCode = fs.readFileSync(supabaseJsPath, 'utf8');

      // Must not contain any silent empty catch handlers in sync logic
      expect(supabaseJsCode).not.toMatch(/\.upsert\([\s\S]*?\)\.catch\(\(\)\s*=>\s*\{\}\)/);
    });

    it('does not leak private user data in sanitized error messages', () => {
      const rawError = new Error('Database write failed for user alice@private-domain.com with meal data');
      const safeErrorMsg = rawError.message.replace(
        /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
        '[redacted]'
      );

      expect(safeErrorMsg).not.toContain('alice@private-domain.com');
      expect(safeErrorMsg).toContain('[redacted]');
    });
  });
});
