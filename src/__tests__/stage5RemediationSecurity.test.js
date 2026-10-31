import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Stage 5 — Security Remediation & Performance Verification', () => {
  const schemaPath = path.resolve(__dirname, '../../supabase_schema.sql');
  const migrationPath = path.resolve(__dirname, '../../supabase/migrations/20261031_stage5_remediation.sql');
  const homePagePath = path.resolve(__dirname, '../pages/HomePage.jsx');
  const supabaseServicePath = path.resolve(__dirname, '../services/supabase.js');

  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');
  const homePageCode = fs.readFileSync(homePagePath, 'utf8');
  const supabaseServiceCode = fs.readFileSync(supabaseServicePath, 'utf8');

  describe('Part 1: Friendship Security (DEFECT-SEC-01)', () => {
    it('enforces recipient-only update policy and removes initiator self-approval', () => {
      // Must not allow initiator to update status
      expect(schemaSql).not.toMatch(/Friendships update by recipient"\s+ON public\.friendships\s+FOR UPDATE\s+USING\s*\([^)]*auth\.uid\(\)\s*=\s*user_id/i);
      expect(migrationSql).toMatch(/Friendships update by recipient only/);
      expect(migrationSql).toMatch(/auth\.uid\(\)\s*=\s*friend_id/);
      expect(migrationSql).toMatch(/AND status = 'pending'/);
    });

    it('enforces immutability trigger preventing identity modification and self-friending', () => {
      expect(migrationSql).toMatch(/check_friendship_immutability\(\)/);
      expect(migrationSql).toMatch(/NEW\.user_id <> OLD\.user_id OR NEW\.friend_id <> OLD\.friend_id/);
      expect(migrationSql).toMatch(/Initiator cannot accept their own friend request/);
      expect(migrationSql).toMatch(/Users cannot friend themselves/);
      expect(schemaSql).toMatch(/chk_friendships_no_self_friend/);
    });

    it('emulates friendship authorization states accurately', () => {
      const friendship = {
        id: 'friendship_123',
        userId: 'user_initiator_A',
        friendId: 'user_recipient_B',
        status: 'pending',
      };

      // Helper simulating RLS + trigger check
      function evaluateFriendshipUpdate(actingUserId, newRecord) {
        // Immutability check
        if (newRecord.id !== friendship.id || newRecord.userId !== friendship.userId || newRecord.friendId !== friendship.friendId) {
          throw new Error('Identity columns cannot be modified');
        }
        if (newRecord.userId === newRecord.friendId) {
          throw new Error('Users cannot friend themselves');
        }
        // Initiator attempting self approval
        if (friendship.status === 'pending' && newRecord.status === 'accepted' && actingUserId === friendship.userId) {
          throw new Error('Initiator cannot accept their own friend request');
        }
        // RLS USING check: only recipient can update pending
        if (actingUserId !== friendship.friendId) {
          return { allowed: false, error: 'RLS: Permission denied' };
        }
        // Recipient transitions
        if (!['accepted', 'declined', 'blocked'].includes(newRecord.status)) {
          return { allowed: false, error: 'Invalid status transition' };
        }
        return { allowed: true, record: { ...friendship, status: newRecord.status } };
      }

      // Test 1: Initiator attempts self-approval -> BLOCKED
      expect(() => {
        evaluateFriendshipUpdate('user_initiator_A', { ...friendship, status: 'accepted' });
      }).toThrow(/Initiator cannot accept their own friend request/);

      // Test 2: Unrelated user C attempts modification -> BLOCKED by RLS
      const unrelatedResult = evaluateFriendshipUpdate('user_intruder_C', { ...friendship, status: 'accepted' });
      expect(unrelatedResult.allowed).toBe(false);

      // Test 3: User attempts to hijack friendId ownership -> BLOCKED
      expect(() => {
        evaluateFriendshipUpdate('user_recipient_B', { ...friendship, friendId: 'user_intruder_C', status: 'accepted' });
      }).toThrow(/Identity columns cannot be modified/);

      // Test 4: Recipient accepts request -> ALLOWED
      const acceptResult = evaluateFriendshipUpdate('user_recipient_B', { ...friendship, status: 'accepted' });
      expect(acceptResult.allowed).toBe(true);
      expect(acceptResult.record.status).toBe('accepted');

      // Test 5: Recipient declines request -> ALLOWED
      const declineResult = evaluateFriendshipUpdate('user_recipient_B', { ...friendship, status: 'declined' });
      expect(declineResult.allowed).toBe(true);
      expect(declineResult.record.status).toBe('declined');
    });
  });

  describe('Part 2: Leaderboard Score Security (DEFECT-SEC-02)', () => {
    it('defines database check constraints for score boundary validation', () => {
      expect(schemaSql).toMatch(/chk_challenges_consistency_rate/);
      expect(schemaSql).toMatch(/consistency_rate >= 0(\.0)? AND consistency_rate <= 100(\.0)?/);
      expect(schemaSql).toMatch(/chk_challenges_current_streak/);
      expect(schemaSql).toMatch(/current_streak >= 0/);
      expect(schemaSql).toMatch(/chk_challenges_workouts_completed/);
      expect(schemaSql).toMatch(/workouts_completed >= 0/);
    });

    it('implements database trigger clamping client updates to verified habit completions', () => {
      expect(schemaSql).toMatch(/protect_challenge_score_fields\(\)/);
      expect(migrationSql).toMatch(/trg_protect_challenge_scores/);
      expect(migrationSql).toMatch(/COUNT\(DISTINCT date\) INTO v_unique_days/);
      expect(migrationSql).toMatch(/COUNT\(\*\) INTO v_verified_workouts/);
    });

    it('emulates score clamping logic against fabricated client numbers', () => {
      function clampClientScore(submitted, verifiedUniqueDays, elapsedDays, verifiedWorkouts) {
        if (submitted.consistencyRate < 0 || submitted.consistencyRate > 100) {
          throw new Error('consistency_rate must be between 0 and 100');
        }
        if (submitted.currentStreak < 0) {
          throw new Error('current_streak cannot be negative');
        }
        if (submitted.workoutsCompleted < 0) {
          throw new Error('workouts_completed cannot be negative');
        }

        let clampedConsistency = submitted.consistencyRate;
        if (verifiedUniqueDays === 0) {
          clampedConsistency = 0;
        } else {
          const maxConsistency = Math.min(100, Number(((verifiedUniqueDays / Math.max(1, elapsedDays)) * 100).toFixed(1)));
          if (clampedConsistency > maxConsistency) {
            clampedConsistency = maxConsistency;
          }
        }

        const clampedStreak = Math.min(submitted.currentStreak, verifiedUniqueDays);
        const clampedWorkouts = Math.min(submitted.workoutsCompleted, verifiedWorkouts);

        return {
          consistencyRate: clampedConsistency,
          currentStreak: clampedStreak,
          workoutsCompleted: clampedWorkouts,
        };
      }

      // Attacker submits 99% consistency with 0 verified days
      const clampedZero = clampClientScore(
        { consistencyRate: 99, currentStreak: 50, workoutsCompleted: 20 },
        0, // 0 verified completions
        10,
        0
      );
      expect(clampedZero.consistencyRate).toBe(0);
      expect(clampedZero.currentStreak).toBe(0);
      expect(clampedZero.workoutsCompleted).toBe(0);

      // User has 3 completions over 10 days (max 30%)
      const clampedPartial = clampClientScore(
        { consistencyRate: 95, currentStreak: 12, workoutsCompleted: 5 },
        3, // 3 verified days
        10,
        2 // 2 verified workouts
      );
      expect(clampedPartial.consistencyRate).toBe(30);
      expect(clampedPartial.currentStreak).toBe(3);
      expect(clampedPartial.workoutsCompleted).toBe(2);

      // Negative values throw error
      expect(() => {
        clampClientScore({ consistencyRate: -10, currentStreak: 0, workoutsCompleted: 0 }, 1, 1, 1);
      }).toThrow(/consistency_rate must be between 0 and 100/);
      expect(() => {
        clampClientScore({ consistencyRate: 50, currentStreak: -2, workoutsCompleted: 0 }, 1, 1, 1);
      }).toThrow(/current_streak cannot be negative/);
    });
  });

  describe('Part 3: Security Definer Function (DEFECT-SEC-03)', () => {
    it('removes client-controlled p_user_id and derives identity from auth.uid()', () => {
      // Must not accept p_user_id UUID parameter
      expect(schemaSql).not.toMatch(/FUNCTION public\.get_friends_leaderboard\(\s*p_user_id\s+UUID/i);
      expect(migrationSql).toMatch(/DROP FUNCTION IF EXISTS public\.get_friends_leaderboard\(UUID, TEXT\)/);
      expect(schemaSql).toMatch(/FUNCTION public\.get_friends_leaderboard\(\s*p_mode\s+TEXT\s+DEFAULT\s+'beast'\s*\)/);
      expect(schemaSql).toMatch(/auth\.uid\(\)\s+IS NOT NULL/);
      expect(schemaSql).toMatch(/p\.id\s*=\s*auth\.uid\(\)/);
    });

    it('enforces safe explicit search_path and restricts EXECUTE privileges', () => {
      expect(schemaSql).toMatch(/SET search_path = public, auth/);
      expect(schemaSql).toMatch(/REVOKE ALL ON FUNCTION public\.get_friends_leaderboard\(TEXT\) FROM anon/);
      expect(schemaSql).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_friends_leaderboard\(TEXT\) TO authenticated/);
    });

    it('verifies frontend service client calls hardened RPC without p_user_id', () => {
      expect(supabaseServiceCode).toMatch(/supabase\.rpc\('get_friends_leaderboard',\s*\{\s*p_mode:\s*challengeMode,?\s*\}\)/);
      expect(supabaseServiceCode).not.toMatch(/supabase\.rpc\('get_friends_leaderboard',\s*\{\s*p_user_id/);
    });
  });

  describe('Part 5: Home Page Performance & Dependency Decoupling (DEFECT-PERF-01)', () => {
    it('completely decouples HomePage from Recharts', () => {
      expect(homePageCode).not.toMatch(/from\s+['"]recharts['"]/);
      expect(homePageCode).not.toMatch(/<ResponsiveContainer/);
      expect(homePageCode).not.toMatch(/<BarChart/);
      expect(homePageCode).toMatch(/WeeklyDisciplineChart/);
    });

    it('preserves accessible weekly chart semantics and interactive tooltips', () => {
      expect(homePageCode).toMatch(/role=["']region["']/);
      expect(homePageCode).toMatch(/aria-label=["']Weekly habit completion chart["']/);
      expect(homePageCode).toMatch(/role=["']tooltip["']/);
      expect(homePageCode).toMatch(/tabIndex=\{0\}/);
    });
  });
});
