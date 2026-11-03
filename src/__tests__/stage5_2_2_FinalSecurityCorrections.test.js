import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  calculateChallengeScores,
  validateSelectedHabitsMutation,
  createChallenge,
  getStreak,
  isHabitScheduledForDate,
} from '../utils/challenge';

describe('Stage 5.2.2 — Final Security Corrections & Hardening', () => {
  const schemaPath = path.resolve(__dirname, '../../supabase_schema.sql');
  const migrationPath = path.resolve(__dirname, '../../supabase/migrations/20261101_stage5_2_2_final_security_corrections.sql');
  const rollbackPath = path.resolve(__dirname, '../../supabase/migrations/20261101_stage5_2_2_final_security_corrections_rollback.sql');
  const stagingSqlPath = path.resolve(__dirname, '../../supabase/tests/stage5_2_2_staging_verification.sql');

  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');
  const rollbackSql = fs.readFileSync(rollbackPath, 'utf8');
  const stagingSql = fs.readFileSync(stagingSqlPath, 'utf8');

  // ============================================================================
  // Defect 1: Friendship Policy Recursion Elimination
  // ============================================================================
  describe('Defect 1: Friendship Policy Recursion Elimination', () => {
    it('uses public.can_request_friendship helper in friendship insert policy instead of direct subquery', () => {
      const policyRegex = /CREATE POLICY "Friendships insert by initiator"[\s\S]*?public\.can_request_friendship\(friend_id\)/;
      expect(schemaSql).toMatch(policyRegex);
      expect(migrationSql).toMatch(policyRegex);

      const helperDefRegex = /CREATE OR REPLACE FUNCTION public\.can_request_friendship\(p_target_id UUID\)[\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = pg_catalog, public, auth/;
      expect(schemaSql).toMatch(helperDefRegex);
      expect(migrationSql).toMatch(helperDefRegex);
    });

    it('emulates can_request_friendship: permits request when not blocked and denies when blocked', () => {
      const friendshipsTable = [
        { userId: 'user_target', friendId: 'user_spammer', status: 'blocked' },
        { userId: 'user_alice', friendId: 'user_bob', status: 'accepted' },
      ];

      function canRequestFriendship(callerId, targetId) {
        if (!callerId || callerId === targetId) return false;
        const isBlocked = friendshipsTable.some(f =>
          ((f.userId === callerId && f.friendId === targetId) ||
           (f.userId === targetId && f.friendId === callerId)) &&
          f.status === 'blocked'
        );
        return !isBlocked;
      }

      expect(canRequestFriendship('user_spammer', 'user_target')).toBe(false);
      expect(canRequestFriendship('user_target', 'user_spammer')).toBe(false);
      expect(canRequestFriendship('user_clean', 'user_target')).toBe(true);
      expect(canRequestFriendship('user_alice', 'user_alice')).toBe(false);
    });
  });

  // ============================================================================
  // Defect 2: Revocation of Default Permissions & Direct Probing Prevention
  // ============================================================================
  describe('Defect 2: Permission Revocation & Direct Probing Denial', () => {
    it('explicitly revokes default execution permissions on SECURITY DEFINER helpers from PUBLIC and anon', () => {
      const helpers = [
        'is_blocked_between',
        'are_friends',
        'is_group_member',
        'can_request_friendship',
      ];

      for (const fn of helpers) {
        expect(schemaSql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}.*FROM PUBLIC;`));
        expect(schemaSql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}.*FROM anon;`));
        expect(migrationSql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}.*FROM PUBLIC;`));
        expect(migrationSql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}.*FROM anon;`));
      }
    });

    it('revokes execute permissions from authenticated on triggers, internal calculation, and refresh functions', () => {
      const internalFns = [
        'protect_challenge_score_fields',
        'check_friendship_immutability',
        'check_no_future_logs',
        'calculate_authoritative_challenge_metrics',
        'refresh_challenge_scores_on_habit_completion',
        'refresh_challenge_scores_on_workout',
      ];

      for (const fn of internalFns) {
        expect(schemaSql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}.*FROM authenticated;`));
        expect(migrationSql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}.*FROM authenticated;`));
      }
    });

    it('emulates authenticated relationship probing denial: returns false when caller is not a participant', () => {
      const friendshipsTable = [
        { userId: 'user_alice', friendId: 'user_bob', status: 'accepted' },
        { userId: 'user_alice', friendId: 'user_eve', status: 'blocked' },
      ];

      function areFriends(actingUser, userA, userB) {
        if (actingUser && actingUser !== userA && actingUser !== userB) {
          return false;
        }
        return friendshipsTable.some(f =>
          ((f.userId === userA && f.friendId === userB) ||
           (f.userId === userB && f.friendId === userA)) &&
          f.status === 'accepted'
        );
      }

      function isBlockedBetween(actingUser, userA, userB) {
        if (actingUser && actingUser !== userA && actingUser !== userB) {
          return false;
        }
        return friendshipsTable.some(f =>
          ((f.userId === userA && f.friendId === userB) ||
           (f.userId === userB && f.friendId === userA)) &&
          f.status === 'blocked'
        );
      }

      expect(areFriends('user_alice', 'user_alice', 'user_bob')).toBe(true);
      expect(areFriends('user_bob', 'user_alice', 'user_bob')).toBe(true);
      expect(areFriends('user_snooper', 'user_alice', 'user_bob')).toBe(false);
      expect(areFriends('user_eve', 'user_alice', 'user_bob')).toBe(false);
      expect(isBlockedBetween('user_snooper', 'user_alice', 'user_eve')).toBe(false);
      expect(isBlockedBetween('user_alice', 'user_alice', 'user_eve')).toBe(true);
    });

    it('emulates group membership probing denial: returns false when caller is neither member nor group creator', () => {
      const groupsTable = [
        { id: 'grp_secret', creatorId: 'user_alice' },
      ];
      const membersTable = [
        { groupId: 'grp_secret', userId: 'user_bob' },
      ];

      function isGroupMember(actingUser, groupId, targetUserId) {
        if (actingUser && actingUser !== targetUserId) {
          const group = groupsTable.find(g => g.id === groupId);
          if (!group || group.creatorId !== actingUser) {
            return false;
          }
        }
        return membersTable.some(m => m.groupId === groupId && m.userId === targetUserId);
      }

      expect(isGroupMember('user_bob', 'grp_secret', 'user_bob')).toBe(true);
      expect(isGroupMember('user_alice', 'grp_secret', 'user_bob')).toBe(true);
      expect(isGroupMember('user_snooper', 'grp_secret', 'user_bob')).toBe(false);
    });
  });

  // ============================================================================
  // Defect 3: Hardened Search Paths and Full Qualification
  // ============================================================================
  describe('Defect 3: Search Path Hardening', () => {
    it('sets pg_catalog first in search_path and excludes writable pg_temp across all functions', () => {
      const functionsToCheck = [
        'is_blocked_between',
        'are_friends',
        'is_group_member',
        'can_request_friendship',
        'calculate_authoritative_challenge_metrics',
        'protect_challenge_score_fields',
        'refresh_challenge_scores_on_habit_completion',
        'refresh_challenge_scores_on_workout',
        'check_no_future_logs',
        'check_friendship_immutability',
        'get_leaderboard',
        'get_friends_leaderboard',
      ];

      for (const fn of functionsToCheck) {
        const regex = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}[\\s\\S]*?SET search_path = pg_catalog, public, auth`);
        expect(schemaSql).toMatch(regex);
        expect(migrationSql).toMatch(regex);
      }

      expect(schemaSql).not.toMatch(/SET search_path = [^;]*pg_temp/);
      expect(migrationSql).not.toMatch(/SET search_path = [^;]*pg_temp/);
    });
  });

  // ============================================================================
  // Defect 4: Selected Habit IDs Mutation Rules
  // ============================================================================
  describe('Defect 4: Selected Habit IDs Mutation Rules', () => {
    it('defines trigger rules blocking selected_habit_ids mutation after start date or once completions exist', () => {
      expect(schemaSql).toMatch(/selected_habit_ids cannot be modified after the challenge start date/);
      expect(schemaSql).toMatch(/selected_habit_ids cannot be modified once habit completions exist for this challenge/);
      expect(schemaSql).toMatch(/selected_habit_ids can only contain habits owned by the challenge user/);

      expect(migrationSql).toMatch(/selected_habit_ids cannot be modified after the challenge start date/);
      expect(migrationSql).toMatch(/selected_habit_ids cannot be modified once habit completions exist for this challenge/);
    });

    it('enforces selected habit mutation rules in JS utility validateSelectedHabitsMutation', () => {
      const activeChallenge = {
        id: 'c1',
        startDate: '2026-11-01',
        selectedHabitIds: ['h1', 'h2'],
      };

      expect(() => validateSelectedHabitsMutation(activeChallenge, ['h1', 'h2'], [], '2026-11-05')).not.toThrow();

      expect(() => validateSelectedHabitsMutation(activeChallenge, ['h1'], [], '2026-11-02')).toThrow(
        /cannot be modified after the challenge start date/
      );

      expect(() => validateSelectedHabitsMutation(activeChallenge, ['h1', 'h3'], [], '2026-11-01')).not.toThrow();

      const completions = [{ challengeId: 'c1', habitId: 'h1', date: '2026-11-01' }];
      expect(() => validateSelectedHabitsMutation(activeChallenge, ['h1', 'h3'], completions, '2026-11-01')).toThrow(
        /cannot be modified once habit completions exist/
      );
    });
  });

  // ============================================================================
  // Defect 5: Separate Streak Semantics & Workout-Only Challenges
  // ============================================================================
  describe('Defect 5: Separate Streak Semantics & Workout-Only Wanderer Support', () => {
    it('defines separate streak semantics in SQL calculation and challenges table schema', () => {
      expect(schemaSql).toMatch(/activity_streak INT DEFAULT 0 CONSTRAINT chk_challenges_activity_streak CHECK \(activity_streak >= 0\)/);
      expect(migrationSql).toMatch(/ADD COLUMN IF NOT EXISTS activity_streak INT DEFAULT 0/);

      expect(schemaSql).toMatch(/OUT o_current_streak INT,\s*-- Perfect scheduled-habit day streak[\s\S]*?OUT o_activity_streak INT,\s*-- Activity streak/);
      expect(migrationSql).toMatch(/OUT o_current_streak INT,\s*-- Perfect scheduled-habit day streak[\s\S]*?OUT o_activity_streak INT,\s*-- Activity streak/);
    });

    it('calculates workout-only activity streak when no habits are selected (Wanderer challenge)', () => {
      const wandererChallenge = {
        id: 'c_wanderer_wo',
        startDate: '2026-11-01',
        endDate: null,
        mode: 'wanderer',
        duration: null,
        status: 'active',
        selectedHabitIds: [],
      };

      // Workouts completed on 2026-11-01, 2026-11-02, and 2026-11-03
      const workouts = [
        { date: '2026-11-01', status: 'completed' },
        { date: '2026-11-02', status: 'completed' },
        { date: '2026-11-03', status: 'completed' },
      ];

      // No habits participating
      const scores = calculateChallengeScores(wandererChallenge, [], [], workouts, '2026-11-03');

      // Consistency and perfect streak must be 0 because there are no habits
      expect(scores.consistencyPercent).toBe(0);
      expect(scores.perfectStreak).toBe(0);
      expect(scores.currentStreak).toBe(0);

      // Activity streak must be 3 (3 consecutive workout days)
      expect(scores.activityStreak).toBe(3);
      expect(scores.longestActivityStreak).toBe(3);
      expect(scores.workoutsCompleted).toBe(3);
    });

    it('strictly isolates unselected habits from challenge consistency and streak metrics', () => {
      const challenge = {
        id: 'c_selected_only',
        startDate: '2026-11-01',
        endDate: '2026-11-30',
        mode: 'monk',
        status: 'active',
        selectedHabitIds: ['h_selected_1'],
      };

      const habits = [
        { id: 'h_selected_1', name: 'Workout', schedule: 'daily', archived: false },
        { id: 'h_unselected_2', name: 'Water Plants', schedule: 'daily', archived: false },
      ];

      // User completed the UNSELECTED habit 'h_unselected_2' on 2026-11-01
      const completions = [
        { challengeId: 'c_selected_only', habitId: 'h_unselected_2', date: '2026-11-01' },
      ];

      const scores = calculateChallengeScores(challenge, habits, completions, [], '2026-11-01');

      // Unselected habit MUST NOT contribute to consistency, perfect streak, or activity streak
      expect(scores.consistencyPercent).toBe(0);
      expect(scores.perfectStreak).toBe(0);
      expect(scores.currentStreak).toBe(0);
      expect(scores.activityStreak).toBe(0);
    });

    it('enforces fail-closed schedule behavior on unsupported JSON types and invalid strings', () => {
      // 2026-10-26 is Monday
      const monday = '2026-10-26';
      expect(isHabitScheduledForDate({ schedule: 123 }, monday)).toBe(false);
      expect(isHabitScheduledForDate({ schedule: true }, monday)).toBe(false);
      expect(isHabitScheduledForDate({ schedule: { day: 'monday' } }, monday)).toBe(false);
      expect(isHabitScheduledForDate({ schedule: 'random_unsupported' }, monday)).toBe(false);
      expect(isHabitScheduledForDate({ schedule: [] }, monday)).toBe(false);

      // Supported formats
      expect(isHabitScheduledForDate({ schedule: null }, monday)).toBe(true);
      expect(isHabitScheduledForDate({ schedule: 'daily' }, monday)).toBe(true);
      expect(isHabitScheduledForDate({ schedule: ['monday'] }, monday)).toBe(true);
      expect(isHabitScheduledForDate({ schedule: ['mon'] }, monday)).toBe(true);
      expect(isHabitScheduledForDate({ schedule: ['tuesday'] }, monday)).toBe(false);
    });

    it('uses deterministic ISO weekday mapping in database helper and frontend utility', () => {
      expect(migrationSql).toMatch(/EXTRACT\(ISODOW FROM p_date\)/);
      expect(schemaSql).toMatch(/EXTRACT\(ISODOW FROM p_date\)/);

      // Verify all 7 weekdays match deterministically
      // 2026-10-26 (Mon) .. 2026-11-01 (Sun)
      const weekDates = [
        { date: '2026-10-26', day: 'monday', abbr: 'mon' },
        { date: '2026-10-27', day: 'tuesday', abbr: 'tue' },
        { date: '2026-10-28', day: 'wednesday', abbr: 'wed' },
        { date: '2026-10-29', day: 'thursday', abbr: 'thu' },
        { date: '2026-10-30', day: 'friday', abbr: 'fri' },
        { date: '2026-10-31', day: 'saturday', abbr: 'sat' },
        { date: '2026-11-01', day: 'sunday', abbr: 'sun' },
      ];

      for (const { date, day, abbr } of weekDates) {
        expect(isHabitScheduledForDate({ schedule: [day] }, date)).toBe(true);
        expect(isHabitScheduledForDate({ schedule: [abbr] }, date)).toBe(true);
        expect(isHabitScheduledForDate({ schedule: ['daily'] }, date)).toBe(true);
        // Off-day should be false
        const otherDay = day === 'monday' ? 'friday' : 'monday';
        expect(isHabitScheduledForDate({ schedule: [otherDay] }, date)).toBe(false);
      }
    });
  });

  // ============================================================================
  // Defect 6: Wanderer Unlimited-Duration Protection
  // ============================================================================
  describe('Wanderer Mode Unlimited-Duration Protection', () => {
    it('enforces table check constraint chk_challenges_wanderer_null_end_date', () => {
      expect(schemaSql).toMatch(/chk_challenges_wanderer_null_end_date CHECK \(mode <> 'wanderer' OR \(end_date IS NULL AND duration IS NULL\)\)/);
      expect(migrationSql).toMatch(/chk_challenges_wanderer_null_end_date\s+CHECK \(mode <> 'wanderer' OR \(end_date IS NULL AND duration IS NULL\)\)/);
    });

    it('enforces trigger rejection if end_date or duration is assigned to Wanderer', () => {
      expect(schemaSql).toMatch(/Wanderer mode challenges have unlimited duration and cannot have an end_date/);
      expect(schemaSql).toMatch(/Wanderer mode challenges have unlimited duration and cannot have a duration/);
      expect(migrationSql).toMatch(/Wanderer mode challenges have unlimited duration and cannot have an end_date/);
    });
  });

  // ============================================================================
  // Defect 7: Score Refresh Triggers on Completions & Workouts
  // ============================================================================
  describe('Database-Side Score Refresh Triggers', () => {
    it('defines refresh_challenge_scores_on_habit_completion trigger with non-recursive semantics', () => {
      expect(schemaSql).toMatch(/CREATE OR REPLACE FUNCTION public\.refresh_challenge_scores_on_habit_completion\(\)/);
      expect(schemaSql).toMatch(/trg_refresh_challenges_on_habit_completion/);
      expect(migrationSql).toMatch(/CREATE OR REPLACE FUNCTION public\.refresh_challenge_scores_on_habit_completion\(\)/);
      expect(migrationSql).toMatch(/trg_refresh_challenges_on_habit_completion/);
    });

    it('defines refresh_challenge_scores_on_workout trigger with non-recursive semantics', () => {
      expect(schemaSql).toMatch(/CREATE OR REPLACE FUNCTION public\.refresh_challenge_scores_on_workout\(\)/);
      expect(schemaSql).toMatch(/trg_refresh_challenges_on_workout/);
      expect(migrationSql).toMatch(/CREATE OR REPLACE FUNCTION public\.refresh_challenge_scores_on_workout\(\)/);
      expect(migrationSql).toMatch(/trg_refresh_challenges_on_workout/);
    });
  });

  // ============================================================================
  // Defect 8: Function Return-Type Compatibility
  // ============================================================================
  describe('Function Return-Type Compatibility', () => {
    it('safely drops calculate_authoritative_challenge_metrics before recreating to prevent return-type incompatibility', () => {
      expect(migrationSql).toMatch(/DROP FUNCTION IF EXISTS public\.calculate_authoritative_challenge_metrics\(TEXT, UUID, DATE, DATE, TEXT\[\]\);/);
      expect(migrationSql).toMatch(/DROP TRIGGER IF EXISTS trg_protect_challenge_scores ON public\.challenges;/);
    });
  });

  // ============================================================================
  // Defect 9: Habit Privacy Enforcement
  // ============================================================================
  describe('Defect 9: Habit Privacy Review', () => {
    it('restricts habits and habit_completions SELECT policies strictly to auth.uid() = user_id', () => {
      expect(schemaSql).toMatch(/CREATE POLICY "Habits select policy"\s+ON public\.habits\s+FOR SELECT\s+USING \(auth\.uid\(\) = user_id\);/);
      expect(schemaSql).toMatch(/CREATE POLICY "Habit completions read policy"\s+ON public\.habit_completions\s+FOR SELECT\s+USING \(auth\.uid\(\) = user_id\);/);

      expect(migrationSql).toMatch(/CREATE POLICY "Habits select policy"\s+ON public\.habits\s+FOR SELECT\s+USING \(auth\.uid\(\) = user_id\);/);
      expect(migrationSql).toMatch(/CREATE POLICY "Habit completions read policy"\s+ON public\.habit_completions\s+FOR SELECT\s+USING \(auth\.uid\(\) = user_id\);/);
    });

    it('verifies get_leaderboard and get_friends_leaderboard return only aggregate stats, never habit names or schedules', () => {
      const cols = ['rank', 'user_id', 'name', 'avatar', 'consistency_percent', 'current_streak', 'workouts_completed', 'challenge_day'];
      for (const col of cols) {
        expect(schemaSql).toMatch(new RegExp(`\\b${col}\\b`));
      }

      expect(schemaSql).not.toMatch(/RETURNS TABLE \([^)]*habit_name[^)]*\)/i);
      expect(schemaSql).not.toMatch(/RETURNS TABLE \([^)]*schedule[^)]*\)/i);
      expect(schemaSql).not.toMatch(/RETURNS TABLE \([^)]*meal_entries[^)]*\)/i);
    });
  });

  // ============================================================================
  // Defect 10: Challenge UPDATE Authorization
  // ============================================================================
  describe('Defect 10: Challenge UPDATE Authorization', () => {
    it('purges permissive update policies and enforces single owner-only update policy', () => {
      expect(migrationSql).toMatch(/DROP POLICY IF EXISTS %I ON public\.challenges/);
      const updatePolicyRegex = /CREATE POLICY "Challenges user update"\s+ON public\.challenges\s+FOR UPDATE\s+USING \(auth\.uid\(\) = user_id\)\s+WITH CHECK \(auth\.uid\(\) = user_id\);/;
      expect(schemaSql).toMatch(updatePolicyRegex);
      expect(migrationSql).toMatch(updatePolicyRegex);
    });

    it('enforces challenge UPDATE authorization at trigger level', () => {
      expect(schemaSql).toMatch(/IF OLD\.user_id <> auth\.uid\(\) THEN\s+RAISE EXCEPTION 'Users can only update their own challenges\.'/);
      expect(schemaSql).toMatch(/IF NEW\.user_id <> auth\.uid\(\) THEN\s+RAISE EXCEPTION 'Challenge ownership cannot be transferred\.'/);
      expect(migrationSql).toMatch(/IF OLD\.user_id <> auth\.uid\(\) THEN\s+RAISE EXCEPTION 'Users can only update their own challenges\.'/);
    });
  });

  // ============================================================================
  // Defect 11: Friendship Cleanup & Deduplication Audit Table
  // ============================================================================
  describe('Defect 11: Friendship Cleanup & Deduplication Audit Table', () => {
    it('creates _friendships_dedup_backup audit table and preserves opposing block records', () => {
      expect(migrationSql).toMatch(/CREATE TABLE IF NOT EXISTS public\._friendships_dedup_backup/);
      expect(migrationSql).toMatch(/opposing_block BOOLEAN DEFAULT FALSE/);
      expect(migrationSql).toMatch(/COUNT\(\*\) FILTER \(WHERE status = 'blocked'\) OVER/);
    });

    it('emulates reconciliation preserving blocker identity when reciprocal duplicates exist', () => {
      const records = [
        { id: 'f1', userId: 'user_target', friendId: 'user_spammer', status: 'pending', createdAt: '2026-11-01T10:00:00Z' },
        { id: 'f2', userId: 'user_target', friendId: 'user_spammer', status: 'blocked', createdAt: '2026-11-01T11:00:00Z' },
      ];

      function rankFriendship(record) {
        switch (record.status) {
          case 'blocked': return 1;
          case 'accepted': return 2;
          case 'declined': return 3;
          case 'pending': return 4;
          default: return 5;
        }
      }

      const sorted = [...records].sort((a, b) => {
        const rA = rankFriendship(a);
        const rB = rankFriendship(b);
        if (rA !== rB) return rA - rB;
        return a.createdAt.localeCompare(b.createdAt);
      });

      const preserved = sorted[0];
      expect(preserved.status).toBe('blocked');
      expect(preserved.userId).toBe('user_target');
      expect(preserved.friendId).toBe('user_spammer');
    });
  });

  // ============================================================================
  // Rollback Strategy & Data Recovery Integrity
  // ============================================================================
  describe('Rollback Strategy & Data Recovery Integrity', () => {
    it('restores deleted reciprocal and self-friend duplicate records from _friendships_dedup_backup', () => {
      expect(rollbackSql).toMatch(/INSERT INTO public\.friendships \(id, user_id, friend_id, status, created_at\)/);
      expect(rollbackSql).toMatch(/FROM public\._friendships_dedup_backup b/);
      expect(rollbackSql).toMatch(/action_taken IN \('deleted_duplicate', 'deleted_self_friend'\)/);
      expect(rollbackSql).toMatch(/DROP INDEX IF EXISTS public\.uq_friendships_mutual_pair;/);
    });

    it('preserves the audit backup table _friendships_dedup_backup and never drops historical data', () => {
      expect(rollbackSql).not.toMatch(/DROP TABLE.*_friendships_dedup_backup/);
      expect(rollbackSql).toMatch(/Audit backup table public\._friendships_dedup_backup safely preserved/);
    });

    it('preserves hardened search paths and non-recursive RLS policies during rollback', () => {
      expect(rollbackSql).toMatch(/SET search_path = pg_catalog, public, auth/);
      expect(rollbackSql).not.toMatch(/SET search_path = public, auth, pg_temp/);
      expect(rollbackSql).toMatch(/CREATE POLICY "Friendships insert by initiator"[\s\S]*?public\.can_request_friendship\(friend_id\)/);
      expect(rollbackSql).not.toMatch(/CREATE POLICY "Friendships insert by initiator"[\s\S]*?NOT EXISTS \(\s*SELECT 1 FROM public\.friendships/);
    });

    it('safely drops Stage 5.2.2 extensions and restores 4-parameter scoring function', () => {
      expect(rollbackSql).toMatch(/DROP COLUMN IF EXISTS activity_streak/);
      expect(rollbackSql).toMatch(/DROP CONSTRAINT IF EXISTS chk_challenges_wanderer_null_end_date/);
      expect(rollbackSql).toMatch(/DROP FUNCTION IF EXISTS public\.refresh_challenge_scores_on_habit_completion/);
      expect(rollbackSql).toMatch(/DROP FUNCTION IF EXISTS public\.refresh_challenge_scores_on_workout/);
      expect(rollbackSql).toMatch(/DROP FUNCTION IF EXISTS public\.is_habit_scheduled/);
      expect(rollbackSql).toMatch(/OUT o_consistency_rate NUMERIC,\s*OUT o_current_streak INT,\s*OUT o_longest_streak INT,\s*OUT o_workouts_completed INT/);
    });

    it('is fully idempotent and transactional', () => {
      expect(rollbackSql).toMatch(/^BEGIN;/m);
      expect(rollbackSql).toMatch(/COMMIT;$/m);
      expect(rollbackSql).toMatch(/DROP TRIGGER IF EXISTS/);
      expect(rollbackSql).toMatch(/DROP FUNCTION IF EXISTS/);
      expect(rollbackSql).toMatch(/NOT EXISTS \(\s*SELECT 1 FROM public\.friendships f WHERE f\.id = b\.id\s*\)/);
    });
  });

  // ============================================================================
  // Staging Verification SQL Suite
  // ============================================================================
  describe('Staging Verification Test Suite Integrity', () => {
    it('provides a complete, transactional staging verification script with rollback', () => {
      expect(stagingSql).toMatch(/BEGIN;/);
      expect(stagingSql).toMatch(/ROLLBACK;/);
      expect(stagingSql).toMatch(/STARTING STAGE 5\.2\.[24] (FINAL SECURITY CORRECTIONS|FINAL SQL INTEGRITY) STAGING TEST SUITE/);
      expect(stagingSql).toMatch(/can_request_friendship/);
      expect(stagingSql).toMatch(/is_blocked_between/);
      expect(stagingSql).toMatch(/is_group_member/);
      expect(stagingSql).toMatch(/calculate_authoritative_challenge_metrics/);
      expect(stagingSql).toMatch(/chk_challenges_wanderer_null_end_date/);
      expect(stagingSql).toMatch(/_friendships_dedup_backup/);
    });

    it('implements real authenticated-user contexts via SET LOCAL ROLE and JWT claims', () => {
      expect(stagingSql).toMatch(/SET LOCAL ROLE authenticated;/);
      expect(stagingSql).toMatch(/SET LOCAL "request\.jwt\.claims" = '\{"sub":/);
      expect(stagingSql).toMatch(/SET LOCAL "request\.jwt\.claim\.sub"/);
      expect(stagingSql).toMatch(/SET LOCAL ROLE anon;/);
      expect(stagingSql).toMatch(/RESET ROLE;/);
    });

    it('tests friendship INSERT under authenticated role and blocks non-participant probing', () => {
      expect(stagingSql).toMatch(/INSERT INTO public\.friendships.*VALUES \('f_verify_alice_to_bob'/s);
      expect(stagingSql).toMatch(/INSERT INTO public\.friendships.*VALUES \('f_verify_bob_to_alice_dup'/s);
      expect(stagingSql).toMatch(/INSERT INTO public\.friendships.*VALUES \('f_verify_charlie_to_bob_blocked'/s);
      expect(stagingSql).toMatch(/ASSERT public\.is_blocked_between\(v_alice, v_bob\) = FALSE/);
      expect(stagingSql).toMatch(/ASSERT public\.are_friends\(v_alice, v_bob\) = FALSE/);
    });

    it('tests group membership privacy across owner, member, and non-member', () => {
      expect(stagingSql).toMatch(/ASSERT public\.is_group_member\('grp_verify_secret', v_bob\) = TRUE/);
      expect(stagingSql).toMatch(/ASSERT public\.is_group_member\('grp_verify_secret', v_charlie\) = FALSE/);
    });

    it('tests challenge update authorization under authenticated context', () => {
      expect(stagingSql).toMatch(/UPDATE public\.challenges\s+SET name = 'Alice Legitimate Update'/);
      expect(stagingSql).toMatch(/UPDATE public\.challenges\s+SET name = 'Hijacked by Bob'/);
      expect(stagingSql).toMatch(/ASSERT v_rows = 0/);
    });

    it('tests habit and completion privacy via real SELECT queries under authenticated contexts', () => {
      expect(stagingSql).toMatch(/SELECT COUNT\(\*\) INTO v_bob_habit_count\s+FROM public\.habits\s+WHERE id = 'h_priv_bob';/);
      expect(stagingSql).toMatch(/ASSERT v_bob_habit_count = 0/);
      expect(stagingSql).toMatch(/ASSERT v_bob_comp_count = 0/);
      expect(stagingSql).toMatch(/ASSERT v_alice_habit_count = 0/);
      expect(stagingSql).toMatch(/ASSERT v_alice_comp_count = 0/);
    });

    it('tests authoritative scoring cases: workout-only, partial, full, unselected, and interrupted streaks', () => {
      expect(stagingSql).toMatch(/Case 5\.1: No selected habits \+ 1 completed workout/);
      expect(stagingSql).toMatch(/Case 5\.2: Partial scheduled-habit completion/);
      expect(stagingSql).toMatch(/Case 5\.3: Full scheduled-habit completion/);
      expect(stagingSql).toMatch(/Case 5\.4: Unselected habit completion/);
      expect(stagingSql).toMatch(/Case 5\.5: Unscheduled habit completion does NOT count as activity day/);
      expect(stagingSql).toMatch(/Case 5\.6: Consecutive activity days and interrupted streaks/);
    });

    it('tests friendship cleanup reconciliation and verifies duplicate self-friendship isolation', () => {
      expect(stagingSql).toMatch(/COUNT\(\*\) FILTER \(WHERE status = 'blocked'\) OVER/);
      expect(stagingSql).toMatch(/ASSERT v_dup_self_backup_count = 0/);
      expect(stagingSql).toMatch(/ASSERT v_self_backup_count = 2/);
    });

    it('checks function execution privileges across PUBLIC, anon, and authenticated roles', () => {
      expect(stagingSql).toMatch(/has_function_privilege\('anon', 'public\.protect_challenge_score_fields\(\)', 'EXECUTE'\) = FALSE/);
      expect(stagingSql).toMatch(/has_function_privilege\('authenticated', 'public\.protect_challenge_score_fields\(\)', 'EXECUTE'\) = FALSE/);
      expect(stagingSql).toMatch(/has_function_privilege\('anon', 'public\.can_request_friendship\(UUID\)', 'EXECUTE'\) = FALSE/);
      expect(stagingSql).toMatch(/has_function_privilege\('authenticated', 'public\.can_request_friendship\(UUID\)', 'EXECUTE'\) = TRUE/);
    });

    it('verifies CI workflow and Supabase compatibility init script for isolated PostgreSQL validation', () => {
      const ciWorkflowPath = path.resolve(__dirname, '../../.github/workflows/stage5-postgres-validation.yml');
      const ciCompatPath = path.resolve(__dirname, '../../supabase/tests/ci_init_supabase_compat.sql');

      expect(fs.existsSync(ciWorkflowPath)).toBe(true);
      expect(fs.existsSync(ciCompatPath)).toBe(true);

      const ciWorkflow = fs.readFileSync(ciWorkflowPath, 'utf8');
      const ciCompat = fs.readFileSync(ciCompatPath, 'utf8');

      expect(ciWorkflow).toMatch(/postgres:15-alpine/);
      expect(ciWorkflow).toMatch(/ci_init_supabase_compat\.sql/);
      expect(ciWorkflow).toMatch(/20261101_stage5_2_2_final_security_corrections\.sql/);
      expect(ciWorkflow).toMatch(/stage5_2_2_staging_verification\.sql/);
      expect(ciWorkflow).toMatch(/20261101_stage5_2_2_final_security_corrections_rollback\.sql/);

      expect(ciCompat).toMatch(/CREATE ROLE anon/);
      expect(ciCompat).toMatch(/CREATE ROLE authenticated/);
      expect(ciCompat).toMatch(/CREATE SCHEMA IF NOT EXISTS auth/);
      expect(ciCompat).toMatch(/CREATE TABLE IF NOT EXISTS auth\.users/);
      expect(ciCompat).toMatch(/CREATE OR REPLACE FUNCTION auth\.uid\(\)/);
    });
  });
});
