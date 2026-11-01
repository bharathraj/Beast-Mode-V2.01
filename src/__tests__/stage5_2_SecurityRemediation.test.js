import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Stage 5.2 — Comprehensive Security Remediation Verification', () => {
  const schemaPath = path.resolve(__dirname, '../../supabase_schema.sql');
  const migrationPath = path.resolve(__dirname, '../../supabase/migrations/20261031_stage5_2_security_remediation.sql');
  const socialPagePath = path.resolve(__dirname, '../pages/SocialPage.jsx');

  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');
  const socialPageCode = fs.readFileSync(socialPagePath, 'utf8');

  // ----------------------------------------------------------------------------
  // Fix 1: Future-dated habit completions and workouts
  // ----------------------------------------------------------------------------
  describe('Fix 1: Future-dated Habit Completions & Workouts Prevention', () => {
    it('implements trigger-based future date prevention on habit_completions and workout_sessions', () => {
      // Must not use volatile CURRENT_DATE in CHECK constraints
      expect(schemaSql).not.toMatch(/ADD CONSTRAINT.*CHECK\s*\(\s*date\s*<=\s*CURRENT_DATE\s*\)/i);
      expect(migrationSql).not.toMatch(/ADD CONSTRAINT.*CHECK\s*\(\s*date\s*<=\s*CURRENT_DATE\s*\)/i);

      // Must implement check_no_future_logs trigger function
      expect(schemaSql).toMatch(/CREATE OR REPLACE FUNCTION public\.check_no_future_logs\(\)/);
      expect(migrationSql).toMatch(/CREATE OR REPLACE FUNCTION public\.check_no_future_logs\(\)/);

      expect(schemaSql).toMatch(/trg_habit_completions_no_future/);
      expect(schemaSql).toMatch(/trg_workout_sessions_no_future/);
      expect(migrationSql).toMatch(/trg_habit_completions_no_future/);
      expect(migrationSql).toMatch(/trg_workout_sessions_no_future/);

      expect(schemaSql).toMatch(/IF NEW\.date > CURRENT_DATE THEN/);
    });

    it('emulates trigger: blocks future dates and accepts past/present dates', () => {
      const todayStr = '2026-10-31';
      function checkNoFutureLogs(date, today = todayStr) {
        if (date > today) {
          throw new Error(`Cannot record log with future date (${date}) - only past and present dates are permitted.`);
        }
        return true;
      }

      expect(() => checkNoFutureLogs('2026-11-01')).toThrow(/Cannot record log with future date/);
      expect(() => checkNoFutureLogs('2027-01-01')).toThrow(/Cannot record log with future date/);
      expect(checkNoFutureLogs('2026-10-31')).toBe(true);
      expect(checkNoFutureLogs('2026-10-30')).toBe(true);
    });
  });

  // ----------------------------------------------------------------------------
  // Fix 2: Unlinked habit completions (challenge_id IS NULL) must not bleed
  // ----------------------------------------------------------------------------
  describe('Fix 2: Unlinked Habit Completions Isolation', () => {
    it('strictly isolates challenge scores by challenge_id without NULL bleed in database trigger', () => {
      // The trigger should count strictly WHERE challenge_id = OLD.id
      expect(schemaSql).toMatch(/WHERE user_id = OLD\.user_id\s+AND challenge_id = OLD\.id/);
      expect(migrationSql).toMatch(/WHERE user_id = OLD\.user_id\s+AND challenge_id = OLD\.id/);

      // Must NOT allow NULL challenge_id to count towards specific challenge
      expect(migrationSql).not.toMatch(/challenge_id = OLD\.id OR challenge_id IS NULL/);
    });

    it('isolates challenge completions in SocialPage verifiedStats', () => {
      expect(socialPageCode).toMatch(/c\.challengeId === activeChallenge\.id/);
    });
  });

  // ----------------------------------------------------------------------------
  // Fix 3: Challenge id, user_id, and start_date immutability
  // ----------------------------------------------------------------------------
  describe('Fix 3: Challenge Identity and Start Date Immutability', () => {
    it('enforces immutability on id, user_id, and start_date in protect_challenge_score_fields trigger', () => {
      expect(schemaSql).toMatch(/NEW\.id <> OLD\.id OR NEW\.user_id <> OLD\.user_id OR NEW\.start_date <> OLD\.start_date/);
      expect(migrationSql).toMatch(/NEW\.id <> OLD\.id OR NEW\.user_id <> OLD\.user_id OR NEW\.start_date <> OLD\.start_date/);
      expect(schemaSql).toMatch(/Challenge identity \(id, user_id\) and start_date are immutable after creation/);
    });

    it('emulates immutability checks on challenge update attempts', () => {
      const original = { id: 'chal_1', userId: 'user_1', startDate: '2026-08-01', name: 'Original' };

      function validateChallengeUpdate(oldRec, newRec) {
        if (newRec.id !== oldRec.id || newRec.userId !== oldRec.userId || newRec.startDate !== oldRec.startDate) {
          throw new Error('Challenge identity (id, user_id) and start_date are immutable after creation.');
        }
        return true;
      }

      // Legal update: name or status change
      expect(validateChallengeUpdate(original, { ...original, name: 'Updated Name' })).toBe(true);

      // Illegal update: altering start_date
      expect(() => validateChallengeUpdate(original, { ...original, startDate: '2026-09-01' }))
        .toThrow(/immutable after creation/);

      // Illegal update: altering user_id
      expect(() => validateChallengeUpdate(original, { ...original, userId: 'user_attacker' }))
        .toThrow(/immutable after creation/);

      // Illegal update: altering challenge id
      expect(() => validateChallengeUpdate(original, { ...original, id: 'chal_hijacked' }))
        .toThrow(/immutable after creation/);
    });
  });

  // ----------------------------------------------------------------------------
  // Fix 4 & 5: End-date bounding for habits, workouts, and leaderboard
  // ----------------------------------------------------------------------------
  describe('Fix 4 & 5: Challenge End-Date Bounding & Workout Counting', () => {
    it('bounds score calculation window by LEAST(CURRENT_DATE, COALESCE(end_date, CURRENT_DATE))', () => {
      expect(schemaSql).toMatch(/v_calc_end_date := LEAST\(CURRENT_DATE, COALESCE\(OLD\.end_date, CURRENT_DATE\)\);/);
      expect(migrationSql).toMatch(/v_calc_end_date := LEAST\(CURRENT_DATE, COALESCE\(OLD\.end_date, CURRENT_DATE\)\);/);

      // Verifies habit completions bounded by start_date and v_calc_end_date
      expect(schemaSql).toMatch(/date >= OLD\.start_date\s+AND date <= v_calc_end_date/);
      expect(migrationSql).toMatch(/date >= OLD\.start_date\s+AND date <= v_calc_end_date/);

      // Verifies workouts bounded by start_date and v_calc_end_date
      expect(schemaSql).toMatch(/status = 'completed'\s+AND date >= OLD\.start_date\s+AND date <= v_calc_end_date/);
      expect(migrationSql).toMatch(/status = 'completed'\s+AND date >= OLD\.start_date\s+AND date <= v_calc_end_date/);
    });

    it('bounds challenge_day in leaderboard RPCs by end_date', () => {
      const expectedSnippet = /GREATEST\(1, LEAST\(CURRENT_DATE, COALESCE\(c\.end_date, CURRENT_DATE\)\) - c\.start_date \+ 1\)::INT AS challenge_day/;
      expect(schemaSql).toMatch(expectedSnippet);
      expect(migrationSql).toMatch(expectedSnippet);
    });

    it('emulates end-date calculation bounding for completed challenges', () => {
      const today = new Date('2026-10-31');
      const chalStart = new Date('2026-06-01');
      const chalEnd = new Date('2026-08-30'); // Ended in August

      // Evaluation date should be Aug 30, not Oct 31
      const evalDate = new Date(Math.min(today.getTime(), chalEnd.getTime()));
      expect(evalDate.toISOString().slice(0, 10)).toBe('2026-08-30');

      // Workout on 2026-09-15 (after challenge ended) should NOT count
      const workouts = [
        { date: '2026-07-01', status: 'completed' }, // Within
        { date: '2026-08-15', status: 'completed' }, // Within
        { date: '2026-09-15', status: 'completed' }, // Outside (after end_date)
      ];

      const validWorkouts = workouts.filter(w => {
        const d = new Date(w.date);
        return w.status === 'completed' && d >= chalStart && d <= evalDate;
      });

      expect(validWorkouts.length).toBe(2);
    });
  });

  // ----------------------------------------------------------------------------
  // Fix 6: Database streak validation calculates actual consecutive calendar days
  // ----------------------------------------------------------------------------
  describe('Fix 6: Consecutive Calendar Streak Verification', () => {
    it('implements backward calendar day-by-day loop in protect_challenge_score_fields trigger', () => {
      expect(schemaSql).toMatch(/v_curr_check DATE;/);
      expect(schemaSql).toMatch(/v_calculated_streak INT := 0;/);
      expect(schemaSql).toMatch(/WHILE v_curr_check >= OLD\.start_date AND EXISTS/);
      expect(migrationSql).toMatch(/WHILE v_curr_check >= OLD\.start_date AND EXISTS/);
      expect(schemaSql).toMatch(/v_curr_check := v_curr_check - 1;/);
      expect(schemaSql).toMatch(/IF NEW\.current_streak > v_calculated_streak THEN\s+NEW\.current_streak := v_calculated_streak;/);
    });

    it('emulates consecutive streak calculation vs unique scattered days', () => {
      // Scenario: User completed 10 unique days scattered across 90 days, but last completion was 5 days ago
      function calculateConsecutiveStreak(completionDates, checkDateStr, startDateStr) {
        const set = new Set(completionDates);
        const checkDate = new Date(checkDateStr);
        const yesterday = new Date(checkDate);
        yesterday.setDate(yesterday.getDate() - 1);

        const checkStr = checkDate.toISOString().slice(0, 10);
        const yestStr = yesterday.toISOString().slice(0, 10);

        let curr;
        if (set.has(checkStr)) {
          curr = new Date(checkDate);
        } else if (set.has(yestStr)) {
          curr = new Date(yesterday);
        } else {
          return 0; // Streak is broken
        }

        let streak = 0;
        const start = new Date(startDateStr);
        while (curr >= start) {
          const s = curr.toISOString().slice(0, 10);
          if (set.has(s)) {
            streak++;
            curr.setDate(curr.getDate() - 1);
          } else {
            break;
          }
        }
        return streak;
      }

      // Case A: 10 scattered days, streak must be 0
      const scattered = ['2026-08-01', '2026-08-05', '2026-08-12', '2026-09-01', '2026-10-20'];
      expect(calculateConsecutiveStreak(scattered, '2026-10-31', '2026-08-01')).toBe(0);

      // Case B: Completed today and yesterday (streak = 2)
      const consecutiveToday = ['2026-10-30', '2026-10-31'];
      expect(calculateConsecutiveStreak(consecutiveToday, '2026-10-31', '2026-08-01')).toBe(2);

      // Case C: Completed yesterday only, today still open (streak = 1 preserved)
      const consecutiveYesterday = ['2026-10-30'];
      expect(calculateConsecutiveStreak(consecutiveYesterday, '2026-10-31', '2026-08-01')).toBe(1);

      // Case D: Completed last 5 consecutive days: 27, 28, 29, 30, 31 (streak = 5)
      const fiveDays = ['2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31'];
      expect(calculateConsecutiveStreak(fiveDays, '2026-10-31', '2026-08-01')).toBe(5);

      // Case E: If an attacker submits streak: 50 when calculated streak is 5, clamping sets it to 5
      const submittedStreak = 50;
      const verifiedStreak = calculateConsecutiveStreak(fiveDays, '2026-10-31', '2026-08-01');
      const clamped = Math.min(submittedStreak, verifiedStreak);
      expect(clamped).toBe(5);
    });
  });

  // ----------------------------------------------------------------------------
  // Fix 7: Reciprocal duplicate friendships prevented by symmetric index
  // ----------------------------------------------------------------------------
  describe('Fix 7: Symmetric Mutual Friendship Uniqueness', () => {
    it('defines symmetric unique index uq_friendships_mutual_pair in schema and migration', () => {
      const indexSnippet = /CREATE UNIQUE INDEX IF NOT EXISTS uq_friendships_mutual_pair\s+ON public\.friendships\s*\(LEAST\(user_id, friend_id\), GREATEST\(user_id, friend_id\)\);/;
      expect(schemaSql).toMatch(indexSnippet);
      expect(migrationSql).toMatch(indexSnippet);
    });

    it('emulates symmetric mutual pair deduplication and uniqueness', () => {
      function getPairKey(u1, u2) {
        return u1 < u2 ? `${u1}:${u2}` : `${u2}:${u1}`;
      }

      const existingFriendships = new Set();
      function insertFriendship(u1, u2) {
        if (u1 === u2) throw new Error('Cannot friend self');
        const key = getPairKey(u1, u2);
        if (existingFriendships.has(key)) {
          throw new Error('Duplicate friendship pair');
        }
        existingFriendships.add(key);
        return true;
      }

      expect(insertFriendship('user_A', 'user_B')).toBe(true);
      // Reciprocal insertion from user_B to user_A must fail
      expect(() => insertFriendship('user_B', 'user_A')).toThrow(/Duplicate friendship pair/);
      // Independent pair should succeed
      expect(insertFriendship('user_A', 'user_C')).toBe(true);
    });
  });

  // ----------------------------------------------------------------------------
  // Fix 8: Prevent users from sending requests to users who blocked them
  // ----------------------------------------------------------------------------
  describe('Fix 8: Blocked User Request Rejection', () => {
    it('enforces in RLS insert policy that recipient has not blocked initiator', () => {
      expect(schemaSql).toMatch(/CREATE POLICY "Friendships insert by initiator"/);
      expect(schemaSql).toMatch(/NOT EXISTS \(\s*SELECT 1 FROM public\.friendships f\s*WHERE \(\(f\.user_id = friend_id AND f\.friend_id = auth\.uid\(\)\)/);
      expect(schemaSql).toMatch(/AND f\.status = 'blocked'/);

      expect(migrationSql).toMatch(/CREATE POLICY "Friendships insert by initiator"/);
      expect(migrationSql).toMatch(/NOT EXISTS \(\s*SELECT 1 FROM public\.friendships f\s*WHERE \(\(f\.user_id = friend_id AND f\.friend_id = auth\.uid\(\)\)/);
    });

    it('emulates insert policy check preventing requests when blocked', () => {
      const friendshipsTable = [
        { id: 'f1', userId: 'user_target', friendId: 'user_blocked_sender', status: 'blocked' }
      ];

      function canSendFriendRequest(initiatorId, targetId) {
        const isBlocked = friendshipsTable.some(f =>
          ((f.userId === targetId && f.friendId === initiatorId) ||
           (f.userId === initiatorId && f.friendId === targetId)) &&
          f.status === 'blocked'
        );
        return !isBlocked;
      }

      expect(canSendFriendRequest('user_blocked_sender', 'user_target')).toBe(false);
      expect(canSendFriendRequest('user_clean', 'user_target')).toBe(true);
    });
  });

  // ----------------------------------------------------------------------------
  // Fix 9: Blocking and unfriending accepted relationships
  // ----------------------------------------------------------------------------
  describe('Fix 9: Blocking and Unfriending Lifecycle', () => {
    it('enforces update policy allowing either participant to block accepted/pending friendships', () => {
      expect(schemaSql).toMatch(/CREATE POLICY "Friendships update policy"/);
      expect(schemaSql).toMatch(/OR \(\(auth\.uid\(\) = user_id OR auth\.uid\(\) = friend_id\) AND status IN \('pending', 'accepted'\)\)/);
      expect(schemaSql).toMatch(/OR \(status = 'blocked' AND \(auth\.uid\(\) = user_id OR auth\.uid\(\) = friend_id\)\)/);

      expect(migrationSql).toMatch(/CREATE POLICY "Friendships update policy"/);
      expect(migrationSql).toMatch(/OR \(status = 'blocked' AND \(auth\.uid\(\) = user_id OR auth\.uid\(\) = friend_id\)\)/);
    });

    it('enforces immutability trigger protecting against unauthorized blocking or revival', () => {
      expect(schemaSql).toMatch(/IF NEW\.status = 'blocked' AND auth\.uid\(\) <> OLD\.user_id AND auth\.uid\(\) <> OLD\.friend_id THEN/);
      expect(schemaSql).toMatch(/IF OLD\.status = 'blocked' AND NEW\.status <> 'blocked' THEN/);
      expect(schemaSql).toMatch(/Blocked relationships cannot be changed directly/);

      expect(migrationSql).toMatch(/IF OLD\.status = 'blocked' AND NEW\.status <> 'blocked' THEN/);
      expect(migrationSql).toMatch(/Blocked relationships cannot be changed directly/);
    });

    it('emulates friendship blocking and delete (unfriending) permissions', () => {
      const acceptedFriendship = {
        id: 'f_rel_1',
        userId: 'user_A',
        friendId: 'user_B',
        status: 'accepted',
      };

      function updateStatus(actingUser, record, newStatus) {
        // Only participants can block
        if (newStatus === 'blocked') {
          if (actingUser !== record.userId && actingUser !== record.friendId) {
            throw new Error('Only friendship participants can block each other.');
          }
          return { ...record, status: 'blocked' };
        }
        if (record.status === 'blocked' && newStatus !== 'blocked') {
          throw new Error('Blocked relationships cannot be changed directly.');
        }
        // Only recipient can accept/decline pending
        if (['accepted', 'declined'].includes(newStatus)) {
          if (actingUser !== record.friendId) {
            throw new Error('Only recipient can accept or decline');
          }
          return { ...record, status: newStatus };
        }
        return { ...record, status: newStatus };
      }

      function deleteFriendship(actingUser, record) {
        if (actingUser !== record.userId && actingUser !== record.friendId) {
          throw new Error('RLS: delete denied');
        }
        return true;
      }

      // Either user_A or user_B can block an accepted friendship
      expect(updateStatus('user_A', acceptedFriendship, 'blocked').status).toBe('blocked');
      expect(updateStatus('user_B', acceptedFriendship, 'blocked').status).toBe('blocked');

      // Unrelated user cannot block
      expect(() => updateStatus('user_intruder', acceptedFriendship, 'blocked')).toThrow(/Only friendship participants/);

      // Blocked friendship cannot be revived via update
      const blockedRecord = { ...acceptedFriendship, status: 'blocked' };
      expect(() => updateStatus('user_A', blockedRecord, 'accepted')).toThrow(/Blocked relationships cannot be changed directly/);

      // Either participant can unfriend (delete record)
      expect(deleteFriendship('user_A', acceptedFriendship)).toBe(true);
      expect(deleteFriendship('user_B', acceptedFriendship)).toBe(true);
      expect(() => deleteFriendship('user_intruder', acceptedFriendship)).toThrow(/RLS: delete denied/);
    });
  });

  // ----------------------------------------------------------------------------
  // Fix 10: Revocation of EXECUTE permissions on trigger functions
  // ----------------------------------------------------------------------------
  describe('Fix 10: Trigger Function Permission Revocation', () => {
    it('revokes EXECUTE privileges from PUBLIC and anon on all trigger functions', () => {
      // protect_challenge_score_fields
      expect(schemaSql).toMatch(/REVOKE ALL ON FUNCTION public\.protect_challenge_score_fields\(\) FROM PUBLIC;/);
      expect(schemaSql).toMatch(/REVOKE ALL ON FUNCTION public\.protect_challenge_score_fields\(\) FROM anon;/);
      expect(migrationSql).toMatch(/REVOKE ALL ON FUNCTION public\.protect_challenge_score_fields\(\) FROM PUBLIC;/);
      expect(migrationSql).toMatch(/REVOKE ALL ON FUNCTION public\.protect_challenge_score_fields\(\) FROM anon;/);

      // check_friendship_immutability
      expect(schemaSql).toMatch(/REVOKE ALL ON FUNCTION public\.check_friendship_immutability\(\) FROM PUBLIC;/);
      expect(schemaSql).toMatch(/REVOKE ALL ON FUNCTION public\.check_friendship_immutability\(\) FROM anon;/);
      expect(migrationSql).toMatch(/REVOKE ALL ON FUNCTION public\.check_friendship_immutability\(\) FROM PUBLIC;/);
      expect(migrationSql).toMatch(/REVOKE ALL ON FUNCTION public\.check_friendship_immutability\(\) FROM anon;/);

      // check_no_future_logs
      expect(schemaSql).toMatch(/REVOKE ALL ON FUNCTION public\.check_no_future_logs\(\) FROM PUBLIC;/);
      expect(schemaSql).toMatch(/REVOKE ALL ON FUNCTION public\.check_no_future_logs\(\) FROM anon;/);
      expect(migrationSql).toMatch(/REVOKE ALL ON FUNCTION public\.check_no_future_logs\(\) FROM PUBLIC;/);
      expect(migrationSql).toMatch(/REVOKE ALL ON FUNCTION public\.check_no_future_logs\(\) FROM anon;/);
    });
  });
});

