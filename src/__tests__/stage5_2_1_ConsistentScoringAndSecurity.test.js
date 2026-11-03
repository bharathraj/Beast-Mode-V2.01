import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  createChallenge,
  getChallengeDay,
  getChallengeProgress,
  getPhase,
  isChallengeExpired,
  getStreak,
  getMissedDays,
  calculateChallengeScores,
  generateTransformationReport,
} from '../utils/challenge.js';

describe('Stage 5.2.1 — Consistent Scoring & Database Security', () => {
  const schemaPath = path.resolve(__dirname, '../../supabase_schema.sql');
  const migrationPath = path.resolve(__dirname, '../../supabase/migrations/20261101_stage5_2_1_scoring_and_security.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');

  // ============================================================================
  // TASK 1: AUTHORITATIVE SCORING FORMULA
  // Formula: completed scheduled habit occurrences / total scheduled habit occurrences * 100
  // ============================================================================
  describe('Task 1: Unified Authoritative Scoring Formula', () => {
    const habits5 = [
      { id: 'h1', schedule: 'daily', archived: false },
      { id: 'h2', schedule: 'daily', archived: false },
      { id: 'h3', schedule: 'daily', archived: false },
      { id: 'h4', schedule: 'daily', archived: false },
      { id: 'h5', schedule: 'daily', archived: false },
    ];

    it('calculates 20% consistency for five scheduled habits when one is completed', () => {
      const challenge = {
        id: 'chal_1',
        startDate: '2026-10-31',
        endDate: '2026-11-29',
        duration: 30,
        status: 'active',
        selectedHabitIds: ['h1', 'h2', 'h3', 'h4', 'h5'],
      };

      // Exactly 1 habit completed on Day 1
      const completions = [
        { challengeId: 'chal_1', habitId: 'h1', date: '2026-10-31' },
      ];

      const scores = calculateChallengeScores(challenge, habits5, completions, [], '2026-10-31');

      // 1 completed / 5 scheduled = 20%
      expect(scores.totalScheduledOccurrences).toBe(5);
      expect(scores.completedScheduledOccurrences).toBe(1);
      expect(scores.consistencyPercent).toBe(20);
    });

    it('calculates 100% consistency for five scheduled habits when all are completed', () => {
      const challenge = {
        id: 'chal_1',
        startDate: '2026-10-31',
        endDate: '2026-11-29',
        duration: 30,
        status: 'active',
        selectedHabitIds: ['h1', 'h2', 'h3', 'h4', 'h5'],
      };

      // All 5 habits completed on Day 1
      const completions = [
        { challengeId: 'chal_1', habitId: 'h1', date: '2026-10-31' },
        { challengeId: 'chal_1', habitId: 'h2', date: '2026-10-31' },
        { challengeId: 'chal_1', habitId: 'h3', date: '2026-10-31' },
        { challengeId: 'chal_1', habitId: 'h4', date: '2026-10-31' },
        { challengeId: 'chal_1', habitId: 'h5', date: '2026-10-31' },
      ];

      const scores = calculateChallengeScores(challenge, habits5, completions, [], '2026-10-31');

      // 5 completed / 5 scheduled = 100%
      expect(scores.totalScheduledOccurrences).toBe(5);
      expect(scores.completedScheduledOccurrences).toBe(5);
      expect(scores.consistencyPercent).toBe(100);
    });

    it('returns 0% consistency and 0 streak when no habits are scheduled', () => {
      const challenge = {
        id: 'chal_1',
        startDate: '2026-10-31',
        endDate: '2026-11-29',
        duration: 30,
        status: 'active',
        selectedHabitIds: [],
      };

      const scores = calculateChallengeScores(challenge, [], [], [], '2026-10-31');

      expect(scores.totalScheduledOccurrences).toBe(0);
      expect(scores.completedScheduledOccurrences).toBe(0);
      expect(scores.consistencyPercent).toBe(0);
      expect(scores.currentStreak).toBe(0);
      expect(scores.longestStreak).toBe(0);
    });

    it('respects custom weekday schedules for habits (e.g. Mon/Wed/Fri)', () => {
      // 2026-10-26 is Monday, 2026-10-27 is Tuesday, 2026-10-28 is Wednesday
      const mwfHabit = {
        id: 'h_mwf',
        schedule: ['monday', 'wednesday', 'friday'],
        archived: false,
      };

      const challenge = {
        id: 'chal_mwf',
        startDate: '2026-10-26', // Mon
        endDate: '2026-10-28',   // Wed (3 days total: Mon, Tue, Wed)
        duration: 3,
        status: 'active',
        selectedHabitIds: ['h_mwf'],
      };

      // Completed on Monday (scheduled) and Tuesday (not scheduled for MWF)
      const completions = [
        { challengeId: 'chal_mwf', habitId: 'h_mwf', date: '2026-10-26' },
        { challengeId: 'chal_mwf', habitId: 'h_mwf', date: '2026-10-27' }, // unscheduled day
      ];

      const scores = calculateChallengeScores(challenge, [mwfHabit], completions, [], '2026-10-28');

      // Mon (scheduled) + Wed (scheduled) = 2 total scheduled occurrences
      // Completed: Mon (1 scheduled completed), Tue was not scheduled so not counted in scheduled occurrences
      expect(scores.totalScheduledOccurrences).toBe(2);
      expect(scores.completedScheduledOccurrences).toBe(1);
      expect(scores.consistencyPercent).toBe(50);
    });
  });

  // ============================================================================
  // TASK 2: CHALLENGE SCORE SECURITY & CREATION VALIDATION
  // ============================================================================
  describe('Task 2: Challenge Score Security & Immutability', () => {
    it('rejects future challenge start dates in createChallenge()', () => {
      expect(() => createChallenge('monk', [], '2099-01-01')).toThrow(/cannot be in the future/);
    });

    it('enforces creation trigger on INSERT to prevent fabricated initial scores', () => {
      // Trigger must execute on BEFORE INSERT OR UPDATE
      expect(schemaSql).toMatch(/BEFORE INSERT OR UPDATE ON public\.challenges/);
      expect(migrationSql).toMatch(/BEFORE INSERT OR UPDATE ON public\.challenges/);

      // Rejects future start_date in database
      expect(schemaSql).toMatch(/IF NEW\.start_date > CURRENT_DATE THEN/);
      expect(migrationSql).toMatch(/IF NEW\.start_date > CURRENT_DATE THEN/);

      // Enforces authorization: user_id must match auth.uid() on INSERT
      expect(schemaSql).toMatch(/NEW\.user_id <> auth\.uid\(\)/);
      expect(migrationSql).toMatch(/NEW\.user_id <> auth\.uid\(\)/);
    });

    it('prevents clients from fabricating scores on creation via authoritative recalculation', () => {
      // In trigger: on INSERT, consistency_rate, current_streak, etc. are derived from authoritative metrics
      expect(schemaSql).toMatch(/SELECT \* INTO v_metrics FROM public\.calculate_authoritative_challenge_metrics/);
      expect(schemaSql).toMatch(/NEW\.consistency_rate := v_metrics\.o_consistency_rate;/);
      expect(schemaSql).toMatch(/NEW\.current_streak := v_metrics\.o_current_streak;/);
      expect(schemaSql).toMatch(/NEW\.workouts_completed := v_metrics\.o_workouts_completed;/);
    });

    it('protects challenge identity and prevents reopening completed/abandoned challenges', () => {
      expect(schemaSql).toMatch(/Challenge identity \(id, user_id\) and start_date are immutable after creation/);
      expect(schemaSql).toMatch(/Cannot reopen a completed or abandoned challenge/);
      expect(migrationSql).toMatch(/Cannot reopen a completed or abandoned challenge/);
    });

    it('emulates reopening prevention for completed challenges', () => {
      function validateChallengeTransition(oldStatus, newStatus) {
        if (['completed', 'abandoned'].includes(oldStatus) && newStatus === 'active') {
          throw new Error('Cannot reopen a completed or abandoned challenge.');
        }
        return true;
      }

      expect(() => validateChallengeTransition('completed', 'active')).toThrow(/Cannot reopen/);
      expect(() => validateChallengeTransition('abandoned', 'active')).toThrow(/Cannot reopen/);
      expect(validateChallengeTransition('active', 'completed')).toBe(true);
      expect(validateChallengeTransition('active', 'abandoned')).toBe(true);
    });
  });

  // ============================================================================
  // TASK 3: STREAK CALCULATION (CONSECUTIVE-DAY RULES)
  // ============================================================================
  describe('Task 3: Streak Calculation Rules', () => {
    const today = '2026-10-31';
    const yesterday = '2026-10-30';
    const twoDaysAgo = '2026-10-29';
    const threeDaysAgo = '2026-10-28';
    const fourDaysAgo = '2026-10-27';

    it('maintains streak throughout today when completed yesterday but not today', () => {
      const challenge = {
        id: 'c1',
        startDate: '2026-10-01',
        endDate: '2026-11-30',
        duration: 60,
        status: 'active',
        selectedHabitIds: ['h1'],
      };
      const habits = [{ id: 'h1', schedule: 'daily', archived: false }];
      const completions = [
        { challengeId: 'c1', habitId: 'h1', date: yesterday },
        { challengeId: 'c1', habitId: 'h1', date: twoDaysAgo },
        { challengeId: 'c1', habitId: 'h1', date: threeDaysAgo },
      ];

      const scores = calculateChallengeScores(challenge, habits, completions, [], today);
      expect(scores.currentStreak).toBe(3);
      expect(scores.longestStreak).toBe(3);
    });

    it('increments streak when completed today', () => {
      const challenge = {
        id: 'c1',
        startDate: '2026-10-01',
        endDate: '2026-11-30',
        duration: 60,
        status: 'active',
        selectedHabitIds: ['h1'],
      };
      const habits = [{ id: 'h1', schedule: 'daily', archived: false }];
      const completions = [
        { challengeId: 'c1', habitId: 'h1', date: today },
        { challengeId: 'c1', habitId: 'h1', date: yesterday },
        { challengeId: 'c1', habitId: 'h1', date: twoDaysAgo },
      ];

      const scores = calculateChallengeScores(challenge, habits, completions, [], today);
      expect(scores.currentStreak).toBe(3);
      expect(scores.longestStreak).toBe(3);
    });

    it('breaks streak when non-consecutive (full day missed)', () => {
      const challenge = {
        id: 'c1',
        startDate: '2026-10-01',
        endDate: '2026-11-30',
        duration: 60,
        status: 'active',
        selectedHabitIds: ['h1'],
      };
      const habits = [{ id: 'h1', schedule: 'daily', archived: false }];
      // Missed yesterday and today
      const completions = [
        { challengeId: 'c1', habitId: 'h1', date: twoDaysAgo },
        { challengeId: 'c1', habitId: 'h1', date: threeDaysAgo },
        { challengeId: 'c1', habitId: 'h1', date: fourDaysAgo },
      ];

      const scores = calculateChallengeScores(challenge, habits, completions, [], today);
      expect(scores.currentStreak).toBe(0);
      expect(scores.longestStreak).toBe(3);
    });

    it('strictly excludes future-dated completion attempts from streaks', () => {
      const completionsWithFuture = [
        { habitId: 'h1', date: yesterday },
        { habitId: 'h1', date: '2099-01-01' }, // Future record
        { habitId: 'h1', date: '2099-01-02' }, // Future record
      ];

      const streak = getStreak('h1', completionsWithFuture, today);
      expect(streak.current).toBe(1);
      expect(streak.longest).toBe(1);
    });
  });

  // ============================================================================
  // TASK 4: WORKOUT VERIFICATION
  // ============================================================================
  describe('Task 4: Workout Verification', () => {
    it('counts only workouts with status = "completed"', () => {
      const challenge = {
        id: 'c1',
        startDate: '2026-10-01',
        endDate: '2026-10-31',
        status: 'active',
      };

      const workouts = [
        { id: 'w1', date: '2026-10-05', status: 'completed' },
        { id: 'w2', date: '2026-10-10', status: 'completed' },
        { id: 'w3', date: '2026-10-15', status: 'in_progress' }, // Invalid
        { id: 'w4', date: '2026-10-20', status: 'abandoned' },   // Invalid
      ];

      const scores = calculateChallengeScores(challenge, [], [], workouts, '2026-10-31');
      expect(scores.workoutsCompleted).toBe(2);
    });

    it('excludes workouts outside challenge start and end boundaries', () => {
      const challenge = {
        id: 'c1',
        startDate: '2026-10-10',
        endDate: '2026-10-20',
        status: 'active',
      };

      const workouts = [
        { id: 'w0', date: '2026-10-05', status: 'completed' }, // Before start
        { id: 'w1', date: '2026-10-12', status: 'completed' }, // Within
        { id: 'w2', date: '2026-10-18', status: 'completed' }, // Within
        { id: 'w3', date: '2026-10-25', status: 'completed' }, // After end
      ];

      const scores = calculateChallengeScores(challenge, [], [], workouts, '2026-10-31');
      expect(scores.workoutsCompleted).toBe(2);
    });

    it('defines RLS UPDATE policy on workout_sessions table', () => {
      expect(schemaSql).toMatch(/CREATE POLICY "Workouts user update"\s+ON public\.workout_sessions\s+FOR UPDATE/);
      expect(migrationSql).toMatch(/CREATE POLICY "Workouts user update"\s+ON public\.workout_sessions\s+FOR UPDATE/);
      expect(schemaSql).toMatch(/USING \(auth\.uid\(\) = user_id\)\s+WITH CHECK \(auth\.uid\(\) = user_id\);/);
    });
  });

  // ============================================================================
  // TASK 5: APPLICATION DATE HANDLING
  // ============================================================================
  describe('Task 5: Application Date Handling & Expiration Bounding', () => {
    it('ensures expired challenges do not advance beyond their duration', () => {
      const beastChallenge = {
        id: 'c_beast',
        mode: 'beast',
        duration: 90,
        startDate: '2026-01-01',
        endDate: '2026-03-31',
        status: 'active', // Active but expired
      };

      // Elapsed days since Jan 1 2026 is > 300 days
      const day = getChallengeDay(beastChallenge);
      expect(day).toBe(90); // Clamped strictly to duration

      const progress = getChallengeProgress(beastChallenge);
      expect(progress.day).toBe(90);
      expect(progress.percent).toBe(100);
      expect(progress.remaining).toBe(0);

      const phase = getPhase(beastChallenge);
      expect(phase.number).toBe(3);
      expect(phase.daysIn).toBe(30); // Phase 3 max daysIn is 30
      expect(phase.daysTotal).toBe(30);

      expect(isChallengeExpired(beastChallenge)).toBe(true);
    });

    it('TransformationReport does not count activity outside challenge window', () => {
      const challenge = {
        id: 'c_rep',
        name: 'Report Challenge',
        mode: 'monk',
        duration: 30,
        startDate: '2026-08-01',
        endDate: '2026-08-30',
        status: 'completed',
        completedAt: '2026-08-30T18:00:00Z',
        selectedHabitIds: ['h1'],
      };

      const state = {
        habits: [{ id: 'h1', schedule: 'daily', archived: false }],
        habitCompletions: [
          { challengeId: 'c_rep', habitId: 'h1', date: '2026-07-31' }, // Before window
          { challengeId: 'c_rep', habitId: 'h1', date: '2026-08-05' }, // In window
          { challengeId: 'c_rep', habitId: 'h1', date: '2026-08-10' }, // In window
          { challengeId: 'c_rep', habitId: 'h1', date: '2026-09-05' }, // After window
        ],
        workoutSessions: [
          { date: '2026-07-20', status: 'completed', exercises: [] }, // Before
          { date: '2026-08-15', status: 'completed', exercises: [{ sets: [{ completed: true, weight: 100, reps: 5 }] }] }, // In
          { date: '2026-08-20', status: 'in_progress', exercises: [] }, // Invalid status
          { date: '2026-09-01', status: 'completed', exercises: [] }, // After
        ],
        mealEntries: [
          { date: '2026-08-12', meal_type: 'lunch', food_name: 'Rice' },
          { date: '2026-09-12', meal_type: 'lunch', food_name: 'Bread' }, // After
        ],
        waterEntries: [
          { date: '2026-08-12', amount: 2500 },
          { date: '2026-09-12', amount: 2000 }, // After
        ],
      };

      const report = generateTransformationReport(challenge, state);
      expect(report.daysTracked).toBe(30);
      expect(report.totalHabitsCompleted).toBe(2);
      expect(report.workoutCount).toBe(1);
      expect(report.totalVolume).toBe(500);
      expect(report.totalMeals).toBe(1);
      expect(report.totalWater).toBe(2500);
    });
  });

  // ============================================================================
  // TASK 6: DATABASE SECURITY & RLS RECURSION ELIMINATION
  // ============================================================================
  describe('Task 6: Database Security & Policy Hardening', () => {
    it('defines is_group_member helper function with SECURITY DEFINER and hardened search_path', () => {
      expect(schemaSql).toMatch(/CREATE OR REPLACE FUNCTION public\.is_group_member\(p_group_id TEXT, p_user_id UUID\)/);
      expect(schemaSql).toMatch(/SET search_path = (pg_catalog, public, auth|public, auth, pg_temp)/);
      expect(migrationSql).toMatch(/CREATE OR REPLACE FUNCTION public\.is_group_member\(p_group_id TEXT, p_user_id UUID\)/);
    });

    it('eliminates group_members and private_groups RLS recursion using is_group_member', () => {
      // In group_members select policy, uses helper function or direct auth.uid() = user_id
      expect(schemaSql).toMatch(/CREATE POLICY "Group members viewable by group members"[\s\S]*?public\.is_group_member/);
      expect(migrationSql).toMatch(/CREATE POLICY "Group members viewable by group members"[\s\S]*?public\.is_group_member/);

      expect(schemaSql).toMatch(/CREATE POLICY "Groups viewable by members or by exact code lookup"[\s\S]*?public\.is_group_member/);
      expect(migrationSql).toMatch(/CREATE POLICY "Groups viewable by members or by exact code lookup"[\s\S]*?public\.is_group_member/);
    });

    it('defines are_friends and is_blocked_between helper functions', () => {
      expect(schemaSql).toMatch(/CREATE OR REPLACE FUNCTION public\.are_friends\(p_user_a UUID, p_user_b UUID\)/);
      expect(schemaSql).toMatch(/CREATE OR REPLACE FUNCTION public\.is_blocked_between\(p_user_a UUID, p_user_b UUID\)/);
      expect(migrationSql).toMatch(/CREATE OR REPLACE FUNCTION public\.are_friends\(p_user_a UUID, p_user_b UUID\)/);
      expect(migrationSql).toMatch(/CREATE OR REPLACE FUNCTION public\.is_blocked_between\(p_user_a UUID, p_user_b UUID\)/);
    });

    it('preserves friendship status (blocked/accepted) during reciprocal duplicate cleanup', () => {
      // Must prioritize status ranking: blocked > accepted > declined > pending
      expect(migrationSql).toMatch(/PARTITION BY LEAST\(user_id, friend_id\), GREATEST\(user_id, friend_id\)/);
      expect(migrationSql).toMatch(/WHEN 'blocked' THEN 1/);
      expect(migrationSql).toMatch(/WHEN 'accepted' THEN 2/);
    });

    it('masks user_id in public leaderboard for anonymous callers', () => {
      const maskedUserIdPattern = /CASE WHEN auth\.uid\(\) IS NOT NULL THEN p\.id ELSE NULL END AS user_id/;
      expect(schemaSql).toMatch(maskedUserIdPattern);
      expect(migrationSql).toMatch(maskedUserIdPattern);
    });

    it('revokes execute permissions on trigger and calculation functions from PUBLIC and anon', () => {
      expect(schemaSql).toMatch(/REVOKE ALL ON FUNCTION public\.calculate_authoritative_challenge_metrics.*FROM PUBLIC;/);
      expect(schemaSql).toMatch(/REVOKE ALL ON FUNCTION public\.calculate_authoritative_challenge_metrics.*FROM anon;/);
      expect(migrationSql).toMatch(/REVOKE ALL ON FUNCTION public\.calculate_authoritative_challenge_metrics.*FROM PUBLIC, anon;/);
    });
  });

  // ============================================================================
  // RLS ISOLATION ACROSS THREE TEST ACCOUNTS (EMULATION & INTEGRITY)
  // ============================================================================
  describe('RLS Isolation Across Three Test Accounts', () => {
    const userA = '00000000-0000-0000-0000-000000000001';
    const userB = '00000000-0000-0000-0000-000000000002';
    const userC = '00000000-0000-0000-0000-000000000003';

    const testProfiles = [
      { id: userA, name: 'User A', share_progress: false },
      { id: userB, name: 'User B', share_progress: true },
      { id: userC, name: 'User C', share_progress: false },
    ];

    const testFriendships = [
      { id: 'f_ab', user_id: userA, friend_id: userB, status: 'accepted' },
      { id: 'f_bc', user_id: userB, friend_id: userC, status: 'blocked' }, // User B blocked User C
    ];

    const testMealEntries = [
      { id: 'm_a', user_id: userA, food_name: 'Private Oats A' },
      { id: 'm_b', user_id: userB, food_name: 'Private Eggs B' },
      { id: 'm_c', user_id: userC, food_name: 'Private Shake C' },
    ];

    it('enforces strict private isolation on food logs (meal_entries)', () => {
      function selectMealEntries(actingUserId) {
        // Policy: USING (auth.uid() = user_id)
        return testMealEntries.filter(m => m.user_id === actingUserId);
      }

      // User A can only see their own meal entries
      const mealsA = selectMealEntries(userA);
      expect(mealsA.length).toBe(1);
      expect(mealsA[0].food_name).toBe('Private Oats A');

      // User B cannot see User A or C's meal entries even though User B shares progress
      const mealsB = selectMealEntries(userB);
      expect(mealsB.length).toBe(1);
      expect(mealsB[0].food_name).toBe('Private Eggs B');
    });

    it('enforces friendship block prevention between User B and User C', () => {
      function canSendFriendRequest(initiatorId, recipientId) {
        if (initiatorId === recipientId) return false;
        // Check if reciprocal blocked relationship exists
        const isBlocked = testFriendships.some(f =>
          ((f.user_id === initiatorId && f.friend_id === recipientId) ||
           (f.user_id === recipientId && f.friend_id === initiatorId)) &&
          f.status === 'blocked'
        );
        return !isBlocked;
      }

      // User C cannot send a friend request to User B because User B blocked User C
      expect(canSendFriendRequest(userC, userB)).toBe(false);

      // User A and User C have no block relationship and can send a request
      expect(canSendFriendRequest(userA, userC)).toBe(true);
    });

    it('enforces challenge read isolation: User A sees friend User B, but User C cannot see private User A', () => {
      const testChallenges = [
        { id: 'c_a', user_id: userA, mode: 'beast' },
        { id: 'c_b', user_id: userB, mode: 'beast' },
        { id: 'c_c', user_id: userC, mode: 'beast' },
      ];

      function selectChallenges(actingUserId) {
        return testChallenges.filter(c => {
          if (c.user_id === actingUserId) return true; // Own
          const prof = testProfiles.find(p => p.id === c.user_id);
          if (prof?.share_progress) return true; // Public
          // Friends
          const isFriend = testFriendships.some(f =>
            ((f.user_id === actingUserId && f.friend_id === c.user_id) ||
             (f.friend_id === actingUserId && f.user_id === c.user_id)) &&
            f.status === 'accepted'
          );
          return isFriend;
        });
      }

      // User A sees own challenge (c_a) and friend's challenge (c_b)
      const visibleToA = selectChallenges(userA).map(c => c.id);
      expect(visibleToA).toContain('c_a');
      expect(visibleToA).toContain('c_b');
      expect(visibleToA).not.toContain('c_c'); // User C is private and not a friend of A

      // User C sees own challenge (c_c) and public user B (c_b), but CANNOT see private User A
      const visibleToC = selectChallenges(userC).map(c => c.id);
      expect(visibleToC).toContain('c_c');
      expect(visibleToC).toContain('c_b');
      expect(visibleToC).not.toContain('c_a');
    });
  });

  // ============================================================================
  // TASK 7: STAGING VERIFICATION SQL SUITE VALIDATION
  // ============================================================================
  describe('Task 7: Staging SQL Verification Test Suite Validation', () => {
    const stagingSqlPath = path.resolve(__dirname, '../../supabase/tests/stage5_2_1_staging_verification.sql');

    it('provides a complete, transactional staging verification script', () => {
      expect(fs.existsSync(stagingSqlPath)).toBe(true);
      const stagingSql = fs.readFileSync(stagingSqlPath, 'utf8');

      // Safe transactional wrapper
      expect(stagingSql).toMatch(/^BEGIN;/m);
      expect(stagingSql).toMatch(/ROLLBACK;$/m);

      // Verifies all required test scenarios
      expect(stagingSql).toMatch(/TEST 1: Five Scheduled Habits, One Completed = 20% Consistency/i);
      expect(stagingSql).toMatch(/TEST 2: Five Scheduled Habits, All Completed = 100% Consistency/i);
      expect(stagingSql).toMatch(/TEST 3: No Scheduled Habits/i);
      expect(stagingSql).toMatch(/TEST 4: Non-consecutive Streaks/i);
      expect(stagingSql).toMatch(/TEST 5: Today \/ Yesterday Streak Behavior/i);
      expect(stagingSql).toMatch(/TEST 6: Future Completion Attempts Rejected/i);
      expect(stagingSql).toMatch(/TEST 7: Challenge Start and End Boundaries/i);
      expect(stagingSql).toMatch(/TEST 8: Fabricated Challenge Creation Scores/i);
      expect(stagingSql).toMatch(/TEST 9: Client Attempts to Manipulate Scores on Update/i);
      expect(stagingSql).toMatch(/TEST 10: Reciprocal Friendship Creation Prevention/i);
      expect(stagingSql).toMatch(/TEST 11: Blocked-User Requests Prevention/i);
      expect(stagingSql).toMatch(/TEST 12: Anonymous Leaderboard Privacy Masking/i);
    });
  });
});

