-- ==============================================================================
-- Beastmode 90 — Database Migration Rollback: Stage 5.2.2 Final Security Corrections (v3)
-- File: supabase/migrations/20261101_stage5_2_2_final_security_corrections_rollback.sql
-- Description:
--   Comprehensive, safe, idempotent, and secure rollback reverting Stage 5.2.2
--   schema extensions and 5-parameter scoring function back to Stage 5.2.1 state.
--
-- Key Principles:
--   1. Data Recovery: Restores deleted duplicate and self-friending records from
--      public._friendships_dedup_backup and verifies exact row restoration.
--      Preserves the backup table for audit integrity (never drops backup data).
--   2. Security Preservation: Does NOT reintroduce insecure search paths or
--      recursive RLS subqueries. Retains pg_catalog-first search paths,
--      caller identity privacy checks, and non-recursive RLS policies.
--   3. Idempotent Execution: Safe to execute repeatedly without failing.
--   4. Dependency Safety: Drops dependent triggers before functions, safely drops
--      indexes to permit reciprocal data restoration.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. FRIENDSHIP DATA RECOVERY & DEDUPLICATION REVERSAL
-- ------------------------------------------------------------------------------

-- 1.1 Unconditionally drop mutual pair unique index
-- In the intended post-rollback schema state, uq_friendships_mutual_pair is dropped
-- regardless of backup row count, permitting restored reciprocal rows to exist.
DROP INDEX IF EXISTS public.uq_friendships_mutual_pair;

DO $$
DECLARE
  v_backup_exists BOOLEAN;
  v_conflict_count INT := 0;
  v_to_restore_count INT := 0;
  v_restored_count INT := 0;
  v_count_before INT := 0;
  v_count_after INT := 0;
  v_unrestored_count INT := 0;
BEGIN
  RAISE NOTICE '========================================================================';
  RAISE NOTICE '>>> STARTING STAGE 5.2.2 ROLLBACK & DATA RECOVERY';
  RAISE NOTICE '========================================================================';
  RAISE NOTICE 'Note: This is a secure recovery rollback, restoring recoverable data while';
  RAISE NOTICE 'preserving SECURITY DEFINER search paths and non-recursive RLS policies.';

  -- Check if backup table exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = '_friendships_dedup_backup'
  ) INTO v_backup_exists;

  IF NOT v_backup_exists THEN
    RAISE NOTICE 'Notice: _friendships_dedup_backup table does not exist. Skipping data restoration.';
  ELSE
    -- 1.2 Conflict detection: fail explicitly if any ID has conflicting records in backup
    SELECT COUNT(*) INTO v_conflict_count
    FROM (
      SELECT id
      FROM public._friendships_dedup_backup
      WHERE action_taken IN ('deleted_duplicate', 'deleted_self_friend')
      GROUP BY id
      HAVING COUNT(DISTINCT (user_id, friend_id, status, created_at)) > 1
    ) conflicts;

    IF v_conflict_count > 0 THEN
      RAISE EXCEPTION 'Rollback aborted: Conflict detected in backup data. % friendship ID(s) have conflicting records in _friendships_dedup_backup.',
        v_conflict_count;
    END IF;

    -- Count distinct rows eligible for restoration
    SELECT COUNT(DISTINCT id) INTO v_to_restore_count
    FROM public._friendships_dedup_backup
    WHERE action_taken IN ('deleted_duplicate', 'deleted_self_friend');

    SELECT COUNT(*) INTO v_count_before
    FROM public.friendships;

    RAISE NOTICE 'Found % distinct deleted records in backup table eligible for restoration (Current friendships: %)...',
      v_to_restore_count, v_count_before;

    IF v_to_restore_count > 0 THEN
      -- Drop self-friend check constraint if restoring self-friendships
      IF EXISTS (
        SELECT 1 FROM public._friendships_dedup_backup WHERE action_taken = 'deleted_self_friend'
      ) THEN
        ALTER TABLE public.friendships
          DROP CONSTRAINT IF EXISTS chk_friendships_no_self_friend;
      END IF;

      -- Restore each original friendship ID exactly once (deduplicating identical backup entries)
      INSERT INTO public.friendships (id, user_id, friend_id, status, created_at)
      SELECT DISTINCT ON (b.id)
        b.id, b.user_id, b.friend_id, b.status, b.created_at
      FROM public._friendships_dedup_backup b
      WHERE b.action_taken IN ('deleted_duplicate', 'deleted_self_friend')
        AND NOT EXISTS (
          SELECT 1 FROM public.friendships f WHERE f.id = b.id
        )
      ORDER BY b.id, b.backup_id DESC;

      GET DIAGNOSTICS v_restored_count = ROW_COUNT;

      SELECT COUNT(*) INTO v_count_after
      FROM public.friendships;

      RAISE NOTICE 'Restored % records into public.friendships (New total: %)',
        v_restored_count, v_count_after;

      -- Verify that no eligible backup rows are missing or corrupted in public.friendships
      SELECT COUNT(*) INTO v_unrestored_count
      FROM (
        SELECT DISTINCT ON (b.id) b.id, b.user_id, b.friend_id, b.status
        FROM public._friendships_dedup_backup b
        WHERE b.action_taken IN ('deleted_duplicate', 'deleted_self_friend')
      ) expected
      WHERE NOT EXISTS (
        SELECT 1 FROM public.friendships f
        WHERE f.id = expected.id
          AND f.user_id = expected.user_id
          AND f.friend_id = expected.friend_id
          AND f.status = expected.status
      );

      ASSERT v_unrestored_count = 0,
        FORMAT('Data Recovery Failed: %s backed up records were not restored accurately into public.friendships', v_unrestored_count);

      RAISE NOTICE '✓ Friendship data recovery verified successfully: 100%% of backed-up records restored.';
    ELSE
      RAISE NOTICE 'No deleted records required restoration.';
    END IF;

    -- NOTE: _friendships_dedup_backup table is INTENTIONALLY RETAINED for audit integrity.
    -- It is never dropped during rollback to prevent irreversible loss of historical audit records.
    RAISE NOTICE '✓ Audit backup table public._friendships_dedup_backup safely preserved.';
  END IF;
END $$;


-- ------------------------------------------------------------------------------
-- 2. DROP SCORE REFRESH TRIGGERS & REFRESH FUNCTIONS
-- ------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_refresh_challenge_on_habit ON public.habit_completions;
DROP TRIGGER IF EXISTS trg_refresh_challenges_on_habit_completion ON public.habit_completions;
DROP FUNCTION IF EXISTS public.refresh_challenge_scores_on_habit_completion();

DROP TRIGGER IF EXISTS trg_refresh_challenge_on_workout ON public.workout_sessions;
DROP TRIGGER IF EXISTS trg_refresh_challenges_on_workout ON public.workout_sessions;
DROP FUNCTION IF EXISTS public.refresh_challenge_scores_on_workout();
DROP FUNCTION IF EXISTS public.is_habit_scheduled(JSONB, DATE);


-- ------------------------------------------------------------------------------
-- 3. REVERT CHALLENGE FUNCTIONS & TRIGGERS (RESTORE STAGE 5.2.1 SIGNATURES)
-- ------------------------------------------------------------------------------

-- Drop dependent challenge trigger before dropping function
DROP TRIGGER IF EXISTS trg_protect_challenge_scores ON public.challenges;

-- Drop Stage 5.2.2 5-OUT-parameter function
DROP FUNCTION IF EXISTS public.calculate_authoritative_challenge_metrics(TEXT, UUID, DATE, DATE, TEXT[]);

-- Restore Stage 5.2.1 calculate_authoritative_challenge_metrics (4 OUT parameters)
-- Retains hardened search_path = pg_catalog, public, auth (Security Definer hardening)
CREATE OR REPLACE FUNCTION public.calculate_authoritative_challenge_metrics(
  p_challenge_id TEXT,
  p_user_id UUID,
  p_start_date DATE,
  p_end_date DATE,
  p_selected_habit_ids TEXT[],
  OUT o_consistency_rate NUMERIC,
  OUT o_current_streak INT,
  OUT o_longest_streak INT,
  OUT o_workouts_completed INT
)
RETURNS RECORD
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_calc_end_date DATE;
  v_cur_date DATE;
  v_day_name TEXT;
  v_total_scheduled INT := 0;
  v_total_completed INT := 0;
  v_current_run INT := 0;
  v_longest_run INT := 0;
  v_prev_completed_date DATE := NULL;
  v_has_today_completed BOOLEAN := FALSE;
  v_has_yesterday_completed BOOLEAN := FALSE;
  v_d DATE;
  v_is_scheduled BOOLEAN;
  v_day_scheduled_count INT;
  v_day_completed_count INT;
  v_effective_habit_ids TEXT[];
  v_num_habits INT := 0;
BEGIN
  v_calc_end_date := LEAST(CURRENT_DATE, COALESCE(p_end_date, CURRENT_DATE));

  IF p_start_date > v_calc_end_date THEN
    o_consistency_rate := 0.0;
    o_current_streak := 0;
    o_longest_streak := 0;
    o_workouts_completed := 0;
    RETURN;
  END IF;

  IF p_selected_habit_ids IS NOT NULL AND array_length(p_selected_habit_ids, 1) > 0 THEN
    v_effective_habit_ids := p_selected_habit_ids;
  ELSE
    SELECT ARRAY_AGG(id) INTO v_effective_habit_ids
    FROM public.habits
    WHERE user_id = p_user_id AND NOT archived;

    IF v_effective_habit_ids IS NULL OR array_length(v_effective_habit_ids, 1) IS NULL THEN
      SELECT ARRAY_AGG(DISTINCT habit_id) INTO v_effective_habit_ids
      FROM public.habit_completions
      WHERE user_id = p_user_id AND challenge_id = p_challenge_id;
    END IF;
  END IF;

  v_num_habits := COALESCE(array_length(v_effective_habit_ids, 1), 0);

  IF v_num_habits = 0 THEN
    SELECT COUNT(*) INTO o_workouts_completed
    FROM public.workout_sessions
    WHERE user_id = p_user_id
      AND status = 'completed'
      AND date >= p_start_date
      AND date <= v_calc_end_date;

    o_consistency_rate := 0.0;
    o_current_streak := 0;
    o_longest_streak := 0;
    RETURN;
  END IF;

  v_cur_date := p_start_date;
  WHILE v_cur_date <= v_calc_end_date LOOP
    v_day_name := lower(trim(to_char(v_cur_date, 'day')));
    v_day_scheduled_count := 0;
    v_day_completed_count := 0;

    FOR i IN 1 .. v_num_habits LOOP
      v_is_scheduled := TRUE;

      IF EXISTS (SELECT 1 FROM public.habits WHERE id = v_effective_habit_ids[i] AND user_id = p_user_id) THEN
        SELECT
          CASE
            WHEN schedule IS NULL OR schedule = '"daily"'::jsonb OR schedule = 'daily'::jsonb THEN TRUE
            WHEN jsonb_typeof(schedule) = 'array' THEN schedule ? v_day_name
            ELSE TRUE
          END
        INTO v_is_scheduled
        FROM public.habits
        WHERE id = v_effective_habit_ids[i] AND user_id = p_user_id;
      END IF;

      IF v_is_scheduled THEN
        v_day_scheduled_count := v_day_scheduled_count + 1;
        v_total_scheduled := v_total_scheduled + 1;

        IF EXISTS (
          SELECT 1 FROM public.habit_completions
          WHERE user_id = p_user_id
            AND challenge_id = p_challenge_id
            AND habit_id = v_effective_habit_ids[i]
            AND date = v_cur_date
        ) THEN
          v_day_completed_count := v_day_completed_count + 1;
          v_total_completed := v_total_completed + 1;
        END IF;
      END IF;
    END LOOP;

    IF v_day_scheduled_count > 0 AND v_day_completed_count > 0 THEN
      IF v_prev_completed_date IS NOT NULL AND v_cur_date = v_prev_completed_date + 1 THEN
        v_current_run := v_current_run + 1;
      ELSE
        v_current_run := 1;
      END IF;
      v_prev_completed_date := v_cur_date;
      IF v_current_run > v_longest_run THEN
        v_longest_run := v_current_run;
      END IF;
    END IF;

    v_cur_date := v_cur_date + 1;
  END LOOP;

  IF v_total_scheduled > 0 THEN
    o_consistency_rate := LEAST(100.0, ROUND((v_total_completed::NUMERIC / v_total_scheduled::NUMERIC) * 100.0, 1));
  ELSE
    o_consistency_rate := 0.0;
  END IF;

  o_current_streak := 0;

  SELECT EXISTS (
    SELECT 1 FROM public.habit_completions
    WHERE user_id = p_user_id AND challenge_id = p_challenge_id AND date = v_calc_end_date
  ) INTO v_has_today_completed;

  SELECT EXISTS (
    SELECT 1 FROM public.habit_completions
    WHERE user_id = p_user_id AND challenge_id = p_challenge_id AND date = v_calc_end_date - 1
  ) INTO v_has_yesterday_completed;

  IF v_has_today_completed THEN
    v_d := v_calc_end_date;
  ELSIF v_has_yesterday_completed THEN
    v_d := v_calc_end_date - 1;
  ELSE
    v_d := NULL;
  END IF;

  IF v_d IS NOT NULL THEN
    WHILE v_d >= p_start_date AND EXISTS (
      SELECT 1 FROM public.habit_completions
      WHERE user_id = p_user_id AND challenge_id = p_challenge_id AND date = v_d
    ) LOOP
      o_current_streak := o_current_streak + 1;
      v_d := v_d - 1;
    END LOOP;
  END IF;

  o_longest_streak := GREATEST(v_longest_run, o_current_streak);

  SELECT COUNT(*) INTO o_workouts_completed
  FROM public.workout_sessions
  WHERE user_id = p_user_id
    AND status = 'completed'
    AND date >= p_start_date
    AND date <= v_calc_end_date;

END;
$$;


-- Restore Stage 5.2.1 protect_challenge_score_fields (without activity_streak)
-- Retains hardened search_path = pg_catalog, public, auth
CREATE OR REPLACE FUNCTION public.protect_challenge_score_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_metrics RECORD;
  v_unique_days INT := 0;
  v_calc_end_date DATE;
  v_elapsed_days INT := 1;
  v_max_consistency NUMERIC := 0.0;
  v_verified_workouts INT := 0;
  v_curr_check DATE;
  v_calculated_streak INT := 0;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.role() = 'authenticated' AND auth.uid() IS NOT NULL THEN
      IF NEW.user_id <> auth.uid() THEN
        RAISE EXCEPTION 'Users can only create challenges for themselves.';
      END IF;
    END IF;

    IF NEW.start_date > CURRENT_DATE THEN
      RAISE EXCEPTION 'Challenge start_date cannot be in the future (%).', NEW.start_date;
    END IF;

    IF NEW.mode = 'monk' THEN
      NEW.duration := 30;
      NEW.end_date := NEW.start_date + INTERVAL '29 days';
    ELSIF NEW.mode = 'beast' THEN
      NEW.duration := 90;
      NEW.end_date := NEW.start_date + INTERVAL '89 days';
    ELSIF NEW.mode = 'wanderer' THEN
      NEW.duration := NULL;
      NEW.end_date := NULL;
    ELSE
      RAISE EXCEPTION 'Invalid challenge mode: %', NEW.mode;
    END IF;

    SELECT * INTO v_metrics FROM public.calculate_authoritative_challenge_metrics(
      NEW.id,
      NEW.user_id,
      NEW.start_date,
      NEW.end_date,
      NEW.selected_habit_ids
    );

    NEW.consistency_rate := v_metrics.o_consistency_rate;
    NEW.current_streak := v_metrics.o_current_streak;
    NEW.longest_streak := v_metrics.o_longest_streak;
    NEW.workouts_completed := v_metrics.o_workouts_completed;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF auth.role() = 'authenticated' AND auth.uid() IS NOT NULL THEN
      IF OLD.user_id <> auth.uid() THEN
        RAISE EXCEPTION 'Users can only update their own challenges.';
      END IF;
      IF NEW.user_id <> auth.uid() THEN
        RAISE EXCEPTION 'Challenge ownership cannot be transferred.';
      END IF;
    END IF;

    IF NEW.id <> OLD.id OR NEW.user_id <> OLD.user_id OR NEW.start_date <> OLD.start_date THEN
      RAISE EXCEPTION 'Challenge identity (id, user_id) and start_date are immutable after creation.';
    END IF;

    IF NEW.mode <> OLD.mode OR NEW.duration IS DISTINCT FROM OLD.duration THEN
      RAISE EXCEPTION 'Challenge mode and duration are immutable after creation.';
    END IF;

    IF OLD.mode IN ('monk', 'beast') AND NEW.end_date <> OLD.end_date THEN
      RAISE EXCEPTION 'Challenge end_date is immutable for structured % mode.', OLD.mode;
    END IF;

    IF OLD.status IN ('completed', 'abandoned') AND NEW.status = 'active' THEN
      RAISE EXCEPTION 'Cannot reopen a completed or abandoned challenge.';
    END IF;

    IF NEW.status = 'completed' AND OLD.status <> 'completed' THEN
      NEW.completed_at := COALESCE(NEW.completed_at, NOW());
    END IF;

    IF NEW.consistency_rate < 0.0 OR NEW.consistency_rate > 100.0 THEN
      RAISE EXCEPTION 'consistency_rate must be between 0 and 100.';
    END IF;

    IF NEW.current_streak < 0 THEN
      RAISE EXCEPTION 'current_streak cannot be negative.';
    END IF;

    IF NEW.workouts_completed < 0 THEN
      RAISE EXCEPTION 'workouts_completed cannot be negative.';
    END IF;

    -- Clamp against verified records
    v_calc_end_date := LEAST(CURRENT_DATE, COALESCE(OLD.end_date, CURRENT_DATE));
    v_elapsed_days := GREATEST(1, (v_calc_end_date - OLD.start_date + 1));

    SELECT COUNT(DISTINCT date) INTO v_unique_days
    FROM public.habit_completions
    WHERE user_id = OLD.user_id AND challenge_id = OLD.id
      AND date >= OLD.start_date AND date <= v_calc_end_date;

    SELECT COUNT(*) INTO v_verified_workouts
    FROM public.workout_sessions
    WHERE user_id = OLD.user_id
      AND status = 'completed' AND date >= OLD.start_date AND date <= v_calc_end_date;

    IF EXISTS (
      SELECT 1 FROM public.habit_completions
      WHERE user_id = OLD.user_id AND challenge_id = OLD.id AND date = v_calc_end_date
    ) THEN
      v_curr_check := v_calc_end_date;
    ELSIF EXISTS (
      SELECT 1 FROM public.habit_completions
      WHERE user_id = OLD.user_id AND challenge_id = OLD.id AND date = v_calc_end_date - 1
    ) THEN
      v_curr_check := v_calc_end_date - 1;
    ELSE
      v_curr_check := NULL;
    END IF;

    IF v_curr_check IS NOT NULL THEN
      WHILE v_curr_check >= OLD.start_date AND EXISTS (
        SELECT 1 FROM public.habit_completions
        WHERE user_id = OLD.user_id AND challenge_id = OLD.id AND date = v_curr_check
      ) LOOP
        v_calculated_streak := v_calculated_streak + 1;
        v_curr_check := v_curr_check - 1;
      END LOOP;
    END IF;

    IF NEW.current_streak > v_calculated_streak THEN
      NEW.current_streak := v_calculated_streak;
    END IF;

    SELECT * INTO v_metrics FROM public.calculate_authoritative_challenge_metrics(
      OLD.id,
      OLD.user_id,
      OLD.start_date,
      OLD.end_date,
      COALESCE(NEW.selected_habit_ids, OLD.selected_habit_ids)
    );

    NEW.consistency_rate := v_metrics.o_consistency_rate;
    NEW.current_streak := v_metrics.o_current_streak;
    NEW.longest_streak := v_metrics.o_longest_streak;
    NEW.workouts_completed := v_metrics.o_workouts_completed;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_protect_challenge_scores
  BEFORE INSERT OR UPDATE ON public.challenges
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_challenge_score_fields();


-- ------------------------------------------------------------------------------
-- 4. DROP CHALLENGE SCHEMA EXTENSIONS
-- ------------------------------------------------------------------------------
ALTER TABLE public.challenges
  DROP CONSTRAINT IF EXISTS chk_challenges_wanderer_null_end_date,
  DROP CONSTRAINT IF EXISTS chk_challenges_activity_streak,
  DROP COLUMN IF EXISTS activity_streak;


-- ------------------------------------------------------------------------------
-- 5. SECURE RLS POLICIES & HELPER FUNCTIONS
--    Retains non-recursive RLS and caller checks to prevent vulnerability regression
-- ------------------------------------------------------------------------------

-- 5.1 Keep can_request_friendship helper to avoid RLS recursion on friendships
CREATE OR REPLACE FUNCTION public.can_request_friendship(p_target_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND auth.uid() <> p_target_id
    AND NOT EXISTS (
      SELECT 1 FROM public.friendships
      WHERE ((user_id = auth.uid() AND friend_id = p_target_id)
          OR (user_id = p_target_id AND friend_id = auth.uid()))
        AND status = 'blocked'
    );
$$;

-- 5.2 Friendship INSERT policy: uses helper (zero table recursion)
DROP POLICY IF EXISTS "Friendships insert by initiator" ON public.friendships;
CREATE POLICY "Friendships insert by initiator"
  ON public.friendships
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND user_id <> friend_id
    AND status = 'pending'
    AND public.can_request_friendship(friend_id)
  );

-- 5.3 Relationship and group helpers (retaining caller privacy check & hardened search_path)
CREATE OR REPLACE FUNCTION public.is_blocked_between(p_user_a UUID, p_user_b UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_a AND auth.uid() <> p_user_b THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.friendships
    WHERE ((user_id = p_user_a AND friend_id = p_user_b)
        OR (user_id = p_user_b AND friend_id = p_user_a))
      AND status = 'blocked'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.are_friends(p_user_a UUID, p_user_b UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_a AND auth.uid() <> p_user_b THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.friendships
    WHERE ((user_id = p_user_a AND friend_id = p_user_b)
        OR (user_id = p_user_b AND friend_id = p_user_a))
      AND status = 'accepted'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_group_member(p_group_id TEXT, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.private_groups
      WHERE id = p_group_id AND creator_id = auth.uid()
    ) THEN
      RETURN FALSE;
    END IF;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = p_group_id AND user_id = p_user_id
  );
END;
$$;


-- ------------------------------------------------------------------------------
-- 6. PERMISSIONS & PRIVILEGE ENFORCEMENT
-- ------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.protect_challenge_score_fields() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.protect_challenge_score_fields() FROM anon;
REVOKE ALL ON FUNCTION public.protect_challenge_score_fields() FROM authenticated;

REVOKE ALL ON FUNCTION public.calculate_authoritative_challenge_metrics(TEXT, UUID, DATE, DATE, TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.calculate_authoritative_challenge_metrics(TEXT, UUID, DATE, DATE, TEXT[]) FROM anon;
REVOKE ALL ON FUNCTION public.calculate_authoritative_challenge_metrics(TEXT, UUID, DATE, DATE, TEXT[]) FROM authenticated;

REVOKE ALL ON FUNCTION public.can_request_friendship(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_request_friendship(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_request_friendship(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.is_blocked_between(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_blocked_between(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_blocked_between(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.are_friends(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.are_friends(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.are_friends(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.is_group_member(TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_group_member(TEXT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_group_member(TEXT, UUID) TO authenticated;

COMMIT;
