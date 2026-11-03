-- ==============================================================================
-- Beastmode 90 — Database Migration: Stage 5.2.2 Final Security Corrections (v2)
-- Migration Name: 20261101_stage5_2_2_final_security_corrections.sql
-- Description:
--   Comprehensive resolution of confirmed security defects & corrections:
--   1. Replaces direct public.friendships subquery in Friendship INSERT RLS policy
--      with public.can_request_friendship() helper to eliminate RLS recursion.
--   2. Explicitly revokes default PUBLIC and anon execution on all SECURITY DEFINER
--      helper functions and enforces caller self-checks to prevent arbitrary relationship
--      and private group probing by authenticated users.
--   3. Hardens all SECURITY DEFINER functions: puts pg_catalog first in search_path,
--      fully qualifies all public and auth schema objects, and removes pg_temp.
--   4. Defines and enforces strict selected_habit_ids mutation rules (locked once
--      past start_date or once completions exist; restricts habits to owner).
--   5. Implements separate streak semantics across application and SQL:
--      - Activity streak (at least 1 habit completed or workout per day).
--      - Perfect scheduled-habit day streak (all scheduled habits completed).
--      - Longest streak.
--      - Supports workout-only Wanderer challenges (workout-only activity streak).
--      - Strictly bounds activity streak to participating challenge habits and workouts.
--   6. Enforces habit privacy: restricts public.habits and public.habit_completions
--      to auth.uid() = user_id so share_progress does not leak habit names or schedules.
--   7. Enforces challenge UPDATE authorization at both RLS and trigger levels
--      (purges any permissive update policies; enforces auth.uid() = user_id).
--   8. Reconciles reciprocal duplicate friendships with an audit/backup table
--      (_friendships_dedup_backup), preserving blocker identity and opposing blocks.
--   9. Enforces Wanderer unlimited duration: end_date and duration MUST be NULL.
--  10. Implements automatic, non-recursive score refresh triggers on habit_completions
--      and workout_sessions.
--  11. Safely drops and recreates calculate_authoritative_challenge_metrics to avoid
--      PostgreSQL function return-type change incompatibility.
--
-- Safety & Idempotency:
--   - Safe transaction wrapper (BEGIN ... COMMIT).
--   - All duplicate cleanup is backed up to _friendships_dedup_backup prior to deletion.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. PRE-MIGRATION BACKUP & FRIENDSHIP RECONCILIATION
--    NOTE: Deduplication is a DESTRUCTIVE cleanup of reciprocal duplicate rows.
--    To ensure zero data loss, all affected rows (including opposing blocks)
--    are fully archived into public._friendships_dedup_backup prior to deletion.
-- ------------------------------------------------------------------------------

-- 1.1 Create audit/recovery backup table for deleted friendship records
CREATE TABLE IF NOT EXISTS public._friendships_dedup_backup (
  backup_id BIGSERIAL PRIMARY KEY,
  id TEXT,
  user_id UUID,
  friend_id UUID,
  status TEXT,
  created_at TIMESTAMPTZ,
  action_taken TEXT,
  opposing_block BOOLEAN DEFAULT FALSE,
  backed_up_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_friendships_dedup_backup_id UNIQUE (id)
);

-- Idempotent constraint application for pre-existing tables with duplicate-ID detection
DO $$
DECLARE
  v_conflict_count INT := 0;
  v_dup_count INT := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_friendships_dedup_backup_id'
      AND conrelid = 'public._friendships_dedup_backup'::regclass
  ) THEN
    -- Check for conflicting duplicate IDs with differing attribute data
    SELECT COUNT(*) INTO v_conflict_count
    FROM (
      SELECT id
      FROM public._friendships_dedup_backup
      GROUP BY id
      HAVING COUNT(DISTINCT (user_id, friend_id, status, created_at)) > 1
    ) conflicts;

    IF v_conflict_count > 0 THEN
      RAISE EXCEPTION 'Cannot add uq_friendships_dedup_backup_id constraint: % ID(s) have conflicting records in pre-existing _friendships_dedup_backup table.',
        v_conflict_count;
    END IF;

    -- Clean up identical duplicate rows if any exist in pre-existing table (retaining latest backup_id)
    SELECT COUNT(*) INTO v_dup_count
    FROM (
      SELECT id
      FROM public._friendships_dedup_backup
      GROUP BY id
      HAVING COUNT(*) > 1
    ) dups;

    IF v_dup_count > 0 THEN
      RAISE NOTICE 'Found % duplicate ID(s) in pre-existing _friendships_dedup_backup. Retaining latest backup record per ID...', v_dup_count;
      DELETE FROM public._friendships_dedup_backup
      WHERE backup_id NOT IN (
        SELECT MAX(backup_id)
        FROM public._friendships_dedup_backup
        GROUP BY id
      );
    END IF;

    ALTER TABLE public._friendships_dedup_backup
      ADD CONSTRAINT uq_friendships_dedup_backup_id UNIQUE (id);
  END IF;
END $$;

-- 1.2 Archive duplicate reciprocal rows and record opposing block conflicts
-- Excludes self-friendships (user_id = friend_id) so they are not categorized as reciprocal duplicates
WITH ranked_friendships AS (
  SELECT
    id,
    user_id,
    friend_id,
    status,
    created_at,
    COUNT(*) FILTER (WHERE status = 'blocked') OVER (
      PARTITION BY LEAST(user_id, friend_id), GREATEST(user_id, friend_id)
    ) AS block_count,
    ROW_NUMBER() OVER (
      PARTITION BY LEAST(user_id, friend_id), GREATEST(user_id, friend_id)
      ORDER BY
        CASE status
          WHEN 'blocked' THEN 1
          WHEN 'accepted' THEN 2
          WHEN 'declined' THEN 3
          WHEN 'pending' THEN 4
          ELSE 5
        END ASC,
        created_at ASC,
        id ASC
    ) AS rank_num
  FROM public.friendships
  WHERE user_id <> friend_id
)
INSERT INTO public._friendships_dedup_backup (
  id, user_id, friend_id, status, created_at, action_taken, opposing_block
)
SELECT
  id, user_id, friend_id, status, created_at,
  CASE WHEN rank_num = 1 THEN 'preserved_primary' ELSE 'deleted_duplicate' END,
  (block_count > 1)
FROM ranked_friendships
WHERE (rank_num > 1 OR block_count > 1)
  AND NOT EXISTS (
    SELECT 1 FROM public._friendships_dedup_backup b
    WHERE b.id = ranked_friendships.id
  );

-- 1.2b Archive self-friending rows before removal (exactly once per row id)
INSERT INTO public._friendships_dedup_backup (
  id, user_id, friend_id, status, created_at, action_taken, opposing_block
)
SELECT id, user_id, friend_id, status, created_at, 'deleted_self_friend', FALSE
FROM public.friendships
WHERE user_id = friend_id
  AND NOT EXISTS (
    SELECT 1 FROM public._friendships_dedup_backup b
    WHERE b.id = public.friendships.id
  );

-- 1.3 Remove self-friending records
DELETE FROM public.friendships
WHERE user_id = friend_id;

-- 1.4 Deduplicate reciprocal friendships (preserving blocker direction and initiator)
WITH ranked_friendships AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY LEAST(user_id, friend_id), GREATEST(user_id, friend_id)
      ORDER BY
        CASE status
          WHEN 'blocked' THEN 1
          WHEN 'accepted' THEN 2
          WHEN 'declined' THEN 3
          WHEN 'pending' THEN 4
          ELSE 5
        END ASC,
        created_at ASC,
        id ASC
    ) AS rank_num
  FROM public.friendships
  WHERE user_id <> friend_id
)
DELETE FROM public.friendships
WHERE id IN (
  SELECT id FROM ranked_friendships WHERE rank_num > 1
);

-- 1.5 Ensure mutual pair uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS uq_friendships_mutual_pair
  ON public.friendships (LEAST(user_id, friend_id), GREATEST(user_id, friend_id));


-- ------------------------------------------------------------------------------
-- 2. SCHEMA EXTENSIONS & CONSTRAINTS
-- ------------------------------------------------------------------------------

ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS activity_streak INT DEFAULT 0;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_challenges_activity_streak') THEN
    ALTER TABLE public.challenges
      ADD CONSTRAINT chk_challenges_activity_streak
      CHECK (activity_streak >= 0);
  END IF;
END $$;

-- Enforce Wanderer unlimited-duration rule (end_date and duration MUST be NULL)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_challenges_wanderer_null_end_date') THEN
    ALTER TABLE public.challenges
      ADD CONSTRAINT chk_challenges_wanderer_null_end_date
      CHECK (mode <> 'wanderer' OR (end_date IS NULL AND duration IS NULL));
  END IF;
END $$;


-- ------------------------------------------------------------------------------
-- 3. HARDENED SECURITY DEFINER HELPER FUNCTIONS
--    - pg_catalog first in search_path
--    - Fully qualified public and auth objects
--    - Self-check privacy guards preventing arbitrary user probing
-- ------------------------------------------------------------------------------

-- 3.1 Check if two users have a blocked relationship (caller must be a participant)
CREATE OR REPLACE FUNCTION public.is_blocked_between(p_user_a UUID, p_user_b UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
BEGIN
  -- Strict privacy guard: authenticated callers can only inspect relationships involving themselves
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

-- 3.2 Check if two users are accepted friends (caller must be a participant)
CREATE OR REPLACE FUNCTION public.are_friends(p_user_a UUID, p_user_b UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
BEGIN
  -- Strict privacy guard: authenticated callers can only inspect relationships involving themselves
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

-- 3.3 Check private group membership (caller must be the member or group creator)
CREATE OR REPLACE FUNCTION public.is_group_member(p_group_id TEXT, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
BEGIN
  -- Strict privacy guard: callers can only check their own membership or groups they created
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

-- 3.4 Check if caller can initiate friendship with target (server-derived identity, no RLS recursion)
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


-- ------------------------------------------------------------------------------
-- 4. HARDENED ROW LEVEL SECURITY POLICIES
-- ------------------------------------------------------------------------------

-- 4.1 Friendship INSERT & UPDATE RLS Policies: purge all permissive policies to prevent OR bypasses
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'friendships' AND cmd = 'INSERT'
  LOOP
    EXECUTE FORMAT('DROP POLICY IF EXISTS %I ON public.friendships;', pol.policyname);
  END LOOP;
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'friendships' AND cmd = 'UPDATE'
  LOOP
    EXECUTE FORMAT('DROP POLICY IF EXISTS %I ON public.friendships;', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "Friendships insert by initiator"
  ON public.friendships
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND user_id <> friend_id
    AND status = 'pending'
    AND public.can_request_friendship(friend_id)
  );

CREATE POLICY "Friendships update policy"
  ON public.friendships
  FOR UPDATE
  USING (
    -- Recipient can accept or decline a pending request
    (auth.uid() = friend_id AND status = 'pending')
    -- OR either participant can transition to blocked
    OR ((auth.uid() = user_id OR auth.uid() = friend_id) AND status IN ('pending', 'accepted'))
  )
  WITH CHECK (
    -- Transitioning to accepted or declined: recipient only
    (status IN ('accepted', 'declined') AND auth.uid() = friend_id)
    -- Transitioning to blocked: either participant
    OR (status = 'blocked' AND (auth.uid() = user_id OR auth.uid() = friend_id))
  );

-- 4.2 Habit Privacy: habits are private to the user; share_progress does not expose habit names
DROP POLICY IF EXISTS "Habits select policy" ON public.habits;
CREATE POLICY "Habits select policy"
  ON public.habits
  FOR SELECT
  USING (auth.uid() = user_id);

-- 4.3 Habit Completions Privacy: completions are private to the user
DROP POLICY IF EXISTS "Habit completions read policy" ON public.habit_completions;
CREATE POLICY "Habit completions read policy"
  ON public.habit_completions
  FOR SELECT
  USING (auth.uid() = user_id);

-- 4.4 Challenge UPDATE Policy: purge any other permissive update policy, enforce owner-only
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN (
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'challenges'
      AND cmd IN ('UPDATE', 'ALL')
      AND policyname <> 'Challenges user update'
  ) LOOP
    EXECUTE FORMAT('DROP POLICY IF EXISTS %I ON public.challenges;', pol.policyname);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Challenges user update" ON public.challenges;
CREATE POLICY "Challenges user update"
  ON public.challenges
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ------------------------------------------------------------------------------
-- 4.5 CANONICAL HABIT SCHEDULE EVALUATION HELPER
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_habit_scheduled(
  p_schedule JSONB,
  p_date DATE
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_isodow INT;
  v_full_day TEXT;
  v_abbr_day TEXT;
  v_elem JSONB;
  v_str TEXT;
BEGIN
  -- 1. NULL schedule = daily (scheduled every day)
  IF p_schedule IS NULL THEN
    RETURN TRUE;
  END IF;

  -- 2. String representations: "daily" or 'daily'
  IF jsonb_typeof(p_schedule) = 'string' THEN
    v_str := lower(trim(both '"' from p_schedule::text));
    IF v_str = 'daily' OR v_str = '' THEN
      RETURN TRUE;
    END IF;
    -- Any other unrecognized string is not scheduled
    RETURN FALSE;
  END IF;

  -- 3. Array of scheduled days: deterministic ISO weekday (1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat, 7=Sun)
  IF jsonb_typeof(p_schedule) = 'array' THEN
    IF jsonb_array_length(p_schedule) = 0 THEN
      -- Empty JSON array [] means NO days scheduled
      RETURN FALSE;
    END IF;

    v_isodow := EXTRACT(ISODOW FROM p_date)::INT;
    v_full_day := CASE v_isodow
      WHEN 1 THEN 'monday'
      WHEN 2 THEN 'tuesday'
      WHEN 3 THEN 'wednesday'
      WHEN 4 THEN 'thursday'
      WHEN 5 THEN 'friday'
      WHEN 6 THEN 'saturday'
      WHEN 7 THEN 'sunday'
    END;

    v_abbr_day := CASE v_isodow
      WHEN 1 THEN 'mon'
      WHEN 2 THEN 'tue'
      WHEN 3 THEN 'wed'
      WHEN 4 THEN 'thu'
      WHEN 5 THEN 'fri'
      WHEN 6 THEN 'sat'
      WHEN 7 THEN 'sun'
    END;

    FOR v_elem IN SELECT * FROM jsonb_array_elements(p_schedule) LOOP
      IF jsonb_typeof(v_elem) = 'string' THEN
        v_str := lower(trim(both '"' from v_elem::text));
        IF v_str = v_full_day OR v_str = v_abbr_day OR v_str = 'daily' THEN
          RETURN TRUE;
        END IF;
      END IF;
    END LOOP;

    RETURN FALSE;
  END IF;

  -- Fail-closed for all other unsupported JSON types (numbers, objects, booleans)
  RETURN FALSE;
END;
$$;

REVOKE ALL ON FUNCTION public.is_habit_scheduled(JSONB, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_habit_scheduled(JSONB, DATE) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_habit_scheduled(JSONB, DATE) TO authenticated;


-- ------------------------------------------------------------------------------
-- 5. FUNCTION RETURN-TYPE COMPATIBILITY & AUTHORITATIVE SCORING
--    Safely drops the old function to avoid:
--    "ERROR: cannot change return type of existing function"
-- ------------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_protect_challenge_scores ON public.challenges;
DROP FUNCTION IF EXISTS public.calculate_authoritative_challenge_metrics(TEXT, UUID, DATE, DATE, TEXT[]);

CREATE OR REPLACE FUNCTION public.calculate_authoritative_challenge_metrics(
  p_challenge_id TEXT,
  p_user_id UUID,
  p_start_date DATE,
  p_end_date DATE,
  p_selected_habit_ids TEXT[],
  OUT o_consistency_rate NUMERIC,
  OUT o_current_streak INT,         -- Perfect scheduled-habit day streak
  OUT o_longest_streak INT,         -- Longest perfect streak
  OUT o_activity_streak INT,        -- Activity streak (at least 1 habit completed or workout per day)
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
  v_total_scheduled INT := 0;
  v_total_completed INT := 0;
  v_perfect_run INT := 0;
  v_longest_perfect_run INT := 0;
  v_active_run INT := 0;
  v_longest_active_run INT := 0;
  v_prev_perfect_date DATE := NULL;
  v_prev_active_date DATE := NULL;
  v_d DATE;
  v_is_scheduled BOOLEAN;
  v_day_scheduled_count INT;
  v_day_completed_count INT;
  v_day_has_workout BOOLEAN;
  v_effective_habit_ids TEXT[];
  v_num_habits INT := 0;
  v_today_is_perfect BOOLEAN := FALSE;
  v_yesterday_is_perfect BOOLEAN := FALSE;
  v_today_is_active BOOLEAN := FALSE;
  v_yesterday_is_active BOOLEAN := FALSE;
BEGIN
  -- Bounded evaluation window
  v_calc_end_date := LEAST(CURRENT_DATE, COALESCE(p_end_date, CURRENT_DATE));

  IF p_start_date > v_calc_end_date THEN
    o_consistency_rate := 0.0;
    o_current_streak := 0;
    o_longest_streak := 0;
    o_activity_streak := 0;
    o_workouts_completed := 0;
    RETURN;
  END IF;

  -- Determine participating habit IDs:
  -- Only unarchived habits that exist and are owned by p_user_id can participate
  IF p_selected_habit_ids IS NOT NULL THEN
    IF array_length(p_selected_habit_ids, 1) > 0 THEN
      SELECT COALESCE(ARRAY_AGG(id), '{}'::TEXT[]) INTO v_effective_habit_ids
      FROM public.habits
      WHERE id = ANY(p_selected_habit_ids)
        AND user_id = p_user_id
        AND NOT archived;
    ELSE
      v_effective_habit_ids := '{}'::TEXT[];
    END IF;
  ELSE
    SELECT COALESCE(ARRAY_AGG(id), '{}'::TEXT[]) INTO v_effective_habit_ids
    FROM public.habits
    WHERE user_id = p_user_id
      AND NOT archived;
  END IF;

  v_num_habits := COALESCE(array_length(v_effective_habit_ids, 1), 0);

  -- Count verified completed workouts in window
  SELECT COUNT(*) INTO o_workouts_completed
  FROM public.workout_sessions
  WHERE user_id = p_user_id
    AND status = 'completed'
    AND date >= p_start_date
    AND date <= v_calc_end_date;

  -- If no habits are participating (e.g. workout-only challenge), habit metrics are 0,
  -- but workout activity streaks MUST continue to be evaluated below
  IF v_num_habits = 0 THEN
    o_consistency_rate := 0.0;
    o_current_streak := 0;
    o_longest_streak := 0;
  END IF;

  -- Iterate through calendar days in window
  v_cur_date := p_start_date;
  WHILE v_cur_date <= v_calc_end_date LOOP
    v_day_scheduled_count := 0;
    v_day_completed_count := 0;

    IF v_num_habits > 0 THEN
      FOR i IN 1 .. v_num_habits LOOP
        SELECT public.is_habit_scheduled(schedule, v_cur_date)
        INTO v_is_scheduled
        FROM public.habits
        WHERE id = v_effective_habit_ids[i] AND user_id = p_user_id;

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
    END IF;

    -- Check workout activity on this date
    SELECT EXISTS (
      SELECT 1 FROM public.workout_sessions
      WHERE user_id = p_user_id AND status = 'completed' AND date = v_cur_date
    ) INTO v_day_has_workout;

    -- Track Perfect Scheduled-Habit Day (all scheduled habits completed; requires >=1 scheduled habit)
    IF v_day_scheduled_count > 0 AND v_day_completed_count >= v_day_scheduled_count THEN
      IF v_prev_perfect_date IS NOT NULL AND v_cur_date = v_prev_perfect_date + 1 THEN
        v_perfect_run := v_perfect_run + 1;
      ELSE
        v_perfect_run := 1;
      END IF;
      v_prev_perfect_date := v_cur_date;
      IF v_perfect_run > v_longest_perfect_run THEN
        v_longest_perfect_run := v_perfect_run;
      END IF;

      IF v_cur_date = v_calc_end_date THEN
        v_today_is_perfect := TRUE;
      END IF;
      IF v_cur_date = v_calc_end_date - 1 THEN
        v_yesterday_is_perfect := TRUE;
      END IF;
    END IF;

    -- Track Activity Day (at least one participating habit completed OR a workout completed)
    IF v_day_completed_count > 0 OR v_day_has_workout THEN
      IF v_prev_active_date IS NOT NULL AND v_cur_date = v_prev_active_date + 1 THEN
        v_active_run := v_active_run + 1;
      ELSE
        v_active_run := 1;
      END IF;
      v_prev_active_date := v_cur_date;
      IF v_active_run > v_longest_active_run THEN
        v_longest_active_run := v_active_run;
      END IF;

      IF v_cur_date = v_calc_end_date THEN
        v_today_is_active := TRUE;
      END IF;
      IF v_cur_date = v_calc_end_date - 1 THEN
        v_yesterday_is_active := TRUE;
      END IF;
    END IF;

    v_cur_date := v_cur_date + 1;
  END LOOP;

  -- 1. Consistency Rate
  IF v_total_scheduled > 0 THEN
    o_consistency_rate := LEAST(100.0, ROUND((v_total_completed::NUMERIC / v_total_scheduled::NUMERIC) * 100.0, 1));
  ELSE
    o_consistency_rate := 0.0;
  END IF;

  -- 2. Perfect Scheduled-Habit Day Streak
  -- Consecutive calendar days where 100% of all scheduled habits were completed
  o_current_streak := 0;
  IF v_num_habits > 0 THEN
    IF v_today_is_perfect THEN
      o_current_streak := v_perfect_run;
    ELSIF v_yesterday_is_perfect THEN
      o_current_streak := v_perfect_run;
    ELSE
      o_current_streak := 0;
    END IF;
    o_longest_streak := v_longest_perfect_run;
  ELSE
    o_current_streak := 0;
    o_longest_streak := 0;
  END IF;

  -- 3. Activity Streak
  -- Consecutive calendar days where the user had challenge activity:
  -- at least one scheduled participating habit completed OR a completed workout
  o_activity_streak := 0;
  IF v_today_is_active THEN
    o_activity_streak := v_active_run;
  ELSIF v_yesterday_is_active THEN
    o_activity_streak := v_active_run;
  ELSE
    o_activity_streak := 0;
  END IF;

END;
$$;


-- ------------------------------------------------------------------------------
-- 6. SCORE PROTECTION & CHALLENGE MUTATION TRIGGER
-- ------------------------------------------------------------------------------

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
  -- ----------------------------------------------------------------------------
  -- INSERT: Validate creation and prevent fabricated initial scores
  -- ----------------------------------------------------------------------------
  IF TG_OP = 'INSERT' THEN
    IF auth.role() = 'authenticated' AND auth.uid() IS NOT NULL THEN
      IF NEW.user_id <> auth.uid() THEN
        RAISE EXCEPTION 'Users can only create challenges for themselves.';
      END IF;
    END IF;

    -- Reject future start dates
    IF NEW.start_date > CURRENT_DATE THEN
      RAISE EXCEPTION 'Challenge start_date cannot be in the future (%).', NEW.start_date;
    END IF;

    -- Validate selected habits belong to creator
    IF NEW.selected_habit_ids IS NOT NULL AND array_length(NEW.selected_habit_ids, 1) > 0 THEN
      IF EXISTS (
        SELECT 1 FROM unnest(NEW.selected_habit_ids) AS h_id
        WHERE NOT EXISTS (
          SELECT 1 FROM public.habits
          WHERE id = h_id AND user_id = NEW.user_id
        )
      ) THEN
        RAISE EXCEPTION 'selected_habit_ids can only contain habits owned by the challenge user.';
      END IF;
    END IF;

    -- Mode durations & Wanderer null end-date enforcement
    IF NEW.mode = 'monk' THEN
      NEW.duration := 30;
      NEW.end_date := NEW.start_date + INTERVAL '29 days';
    ELSIF NEW.mode = 'beast' THEN
      NEW.duration := 90;
      NEW.end_date := NEW.start_date + INTERVAL '89 days';
    ELSIF NEW.mode = 'wanderer' THEN
      IF NEW.end_date IS NOT NULL THEN
        RAISE EXCEPTION 'Wanderer mode challenges have unlimited duration and cannot have an end_date.';
      END IF;
      IF NEW.duration IS NOT NULL THEN
        RAISE EXCEPTION 'Wanderer mode challenges have unlimited duration and cannot have a duration.';
      END IF;
      NEW.duration := NULL;
      NEW.end_date := NULL;
    ELSE
      RAISE EXCEPTION 'Invalid challenge mode: %', NEW.mode;
    END IF;

    -- Calculate authoritative initial values from verified records
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
    NEW.activity_streak := v_metrics.o_activity_streak;
    NEW.workouts_completed := v_metrics.o_workouts_completed;

    RETURN NEW;
  END IF;

  -- ----------------------------------------------------------------------------
  -- UPDATE: Validate ownership, mutations, and enforce authoritative scores
  -- ----------------------------------------------------------------------------
  IF TG_OP = 'UPDATE' THEN
    -- Ownership enforcement: authenticated users cannot update another user's challenge
    IF auth.role() = 'authenticated' AND auth.uid() IS NOT NULL THEN
      IF OLD.user_id <> auth.uid() THEN
        RAISE EXCEPTION 'Users can only update their own challenges.';
      END IF;
      IF NEW.user_id <> auth.uid() THEN
        RAISE EXCEPTION 'Challenge ownership cannot be transferred.';
      END IF;
    END IF;

    -- Immutability on identity and start_date
    IF NEW.id <> OLD.id OR NEW.user_id <> OLD.user_id OR NEW.start_date <> OLD.start_date THEN
      RAISE EXCEPTION 'Challenge identity (id, user_id) and start_date are immutable after creation.';
    END IF;

    -- Mode and duration immutability
    IF NEW.mode <> OLD.mode OR NEW.duration IS DISTINCT FROM OLD.duration THEN
      RAISE EXCEPTION 'Challenge mode and duration are immutable after creation.';
    END IF;

    -- End date immutability for structured modes
    IF OLD.mode IN ('monk', 'beast') AND NEW.end_date <> OLD.end_date THEN
      RAISE EXCEPTION 'Challenge end_date is immutable for structured % mode.', OLD.mode;
    END IF;

    -- Wanderer end date protection
    IF OLD.mode = 'wanderer' THEN
      IF NEW.end_date IS NOT NULL THEN
        RAISE EXCEPTION 'Wanderer mode challenges have unlimited duration and cannot have an end_date.';
      END IF;
      IF NEW.duration IS NOT NULL THEN
        RAISE EXCEPTION 'Wanderer mode challenges have unlimited duration and cannot have a duration.';
      END IF;
    END IF;

    -- Enforce selected_habit_ids mutation rules
    IF NEW.selected_habit_ids IS DISTINCT FROM OLD.selected_habit_ids THEN
      IF CURRENT_DATE > OLD.start_date THEN
        RAISE EXCEPTION 'selected_habit_ids cannot be modified after the challenge start date.';
      END IF;

      IF EXISTS (
        SELECT 1 FROM public.habit_completions
        WHERE challenge_id = OLD.id AND user_id = OLD.user_id
      ) THEN
        RAISE EXCEPTION 'selected_habit_ids cannot be modified once habit completions exist for this challenge.';
      END IF;

      IF NEW.selected_habit_ids IS NOT NULL AND array_length(NEW.selected_habit_ids, 1) > 0 THEN
        IF EXISTS (
          SELECT 1 FROM unnest(NEW.selected_habit_ids) AS h_id
          WHERE NOT EXISTS (
            SELECT 1 FROM public.habits
            WHERE id = h_id AND user_id = OLD.user_id
          )
        ) THEN
          RAISE EXCEPTION 'selected_habit_ids can only contain habits owned by the challenge user.';
        END IF;
      END IF;
    END IF;

    -- Prevent reopening completed or abandoned challenges
    IF OLD.status IN ('completed', 'abandoned') AND NEW.status = 'active' THEN
      RAISE EXCEPTION 'Cannot reopen a completed or abandoned challenge.';
    END IF;

    -- Auto-record completion timestamp on completion
    IF NEW.status = 'completed' AND OLD.status <> 'completed' THEN
      NEW.completed_at := COALESCE(NEW.completed_at, NOW());
    END IF;

    -- Range constraints
    IF NEW.consistency_rate < 0.0 OR NEW.consistency_rate > 100.0 THEN
      RAISE EXCEPTION 'consistency_rate must be between 0 and 100.';
    END IF;

    IF NEW.current_streak < 0 THEN
      RAISE EXCEPTION 'current_streak cannot be negative.';
    END IF;

    IF NEW.workouts_completed < 0 THEN
      RAISE EXCEPTION 'workouts_completed cannot be negative.';
    END IF;

    -- Bounded evaluation date: cannot evaluate past CURRENT_DATE or past challenge end_date
    v_calc_end_date := LEAST(CURRENT_DATE, COALESCE(OLD.end_date, CURRENT_DATE));
    v_elapsed_days := GREATEST(1, (v_calc_end_date - OLD.start_date + 1));

    -- Count distinct completed days strictly for this challenge and within start/end window
    SELECT COUNT(DISTINCT date) INTO v_unique_days
    FROM public.habit_completions
    WHERE user_id = OLD.user_id
      AND challenge_id = OLD.id
      AND date >= OLD.start_date
      AND date <= v_calc_end_date;

    -- Count verified completed workouts strictly within challenge start and end window
    SELECT COUNT(*) INTO v_verified_workouts
    FROM public.workout_sessions
    WHERE user_id = OLD.user_id
      AND status = 'completed'
      AND date >= OLD.start_date
      AND date <= v_calc_end_date;

    -- Calculate true consecutive calendar streak (day-by-day walking backward from today or yesterday)
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

    -- Calculate and enforce authoritative values from verified records on ALL updates
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
    NEW.activity_streak := v_metrics.o_activity_streak;
    NEW.workouts_completed := v_metrics.o_workouts_completed;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_challenge_scores ON public.challenges;
CREATE TRIGGER trg_protect_challenge_scores
  BEFORE INSERT OR UPDATE ON public.challenges
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_challenge_score_fields();


-- ------------------------------------------------------------------------------
-- 7. SECURE DATABASE-SIDE SCORE REFRESH TRIGGERS
--    Ensures habit completions and completed workouts automatically and
--    authoritatively refresh challenge scores without client dependence.
--    Zero recursion: triggers run on child tables and only update public.challenges.
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.refresh_challenge_scores_on_habit_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_user_id UUID;
  v_new_challenge_id TEXT;
  v_old_challenge_id TEXT;
  v_new_date DATE;
  v_old_date DATE;
BEGIN
  v_user_id := COALESCE(NEW.user_id, OLD.user_id);
  v_new_challenge_id := NEW.challenge_id;
  v_old_challenge_id := OLD.challenge_id;
  v_new_date := NEW.date;
  v_old_date := OLD.date;

  -- Refresh target challenge if specified
  IF v_new_challenge_id IS NOT NULL THEN
    UPDATE public.challenges
    SET updated_at = NOW()
    WHERE id = v_new_challenge_id AND user_id = v_user_id;
  END IF;

  -- If challenge_id changed on UPDATE, refresh old challenge as well
  IF v_old_challenge_id IS NOT NULL AND v_old_challenge_id IS DISTINCT FROM v_new_challenge_id THEN
    UPDATE public.challenges
    SET updated_at = NOW()
    WHERE id = v_old_challenge_id AND user_id = v_user_id;
  END IF;

  -- If unlinked completion, touch active challenges covering either new or old dates
  IF v_new_challenge_id IS NULL AND v_old_challenge_id IS NULL THEN
    UPDATE public.challenges
    SET updated_at = NOW()
    WHERE user_id = v_user_id
      AND status = 'active'
      AND (
        (v_new_date IS NOT NULL AND start_date <= v_new_date AND (end_date IS NULL OR end_date >= v_new_date))
        OR
        (v_old_date IS NOT NULL AND start_date <= v_old_date AND (end_date IS NULL OR end_date >= v_old_date))
      );
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_challenges_on_habit_completion ON public.habit_completions;
CREATE TRIGGER trg_refresh_challenges_on_habit_completion
  AFTER INSERT OR UPDATE OR DELETE ON public.habit_completions
  FOR EACH ROW
  EXECUTE FUNCTION public.refresh_challenge_scores_on_habit_completion();


CREATE OR REPLACE FUNCTION public.refresh_challenge_scores_on_workout()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_user_id UUID;
  v_should_refresh BOOLEAN := FALSE;
BEGIN
  v_user_id := COALESCE(NEW.user_id, OLD.user_id);

  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'completed' THEN v_should_refresh := TRUE; END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'completed' OR OLD.status = 'completed' THEN v_should_refresh := TRUE; END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.status = 'completed' THEN v_should_refresh := TRUE; END IF;
  END IF;

  IF v_should_refresh THEN
    -- Refreshes challenges matching new date OR old date (handles workouts moved between dates)
    UPDATE public.challenges
    SET updated_at = NOW()
    WHERE user_id = v_user_id
      AND status = 'active'
      AND (
        (NEW.date IS NOT NULL AND start_date <= NEW.date AND (end_date IS NULL OR end_date >= NEW.date))
        OR
        (OLD.date IS NOT NULL AND start_date <= OLD.date AND (end_date IS NULL OR end_date >= OLD.date))
      );
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_challenges_on_workout ON public.workout_sessions;
CREATE TRIGGER trg_refresh_challenges_on_workout
  AFTER INSERT OR UPDATE OR DELETE ON public.workout_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.refresh_challenge_scores_on_workout();


-- ------------------------------------------------------------------------------
-- 8. HARDEN OTHER SECURITY DEFINER FUNCTIONS & TRIGGERS
-- ------------------------------------------------------------------------------

-- 8.1 Future-date trigger function: search_path hardened
CREATE OR REPLACE FUNCTION public.check_no_future_logs()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
BEGIN
  IF NEW.date > CURRENT_DATE THEN
    RAISE EXCEPTION 'Cannot record log with future date (%) - only past and present dates are permitted.', NEW.date
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

-- 8.2 Friendship immutability trigger: search_path hardened
CREATE OR REPLACE FUNCTION public.check_friendship_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.user_id = NEW.friend_id THEN
      RAISE EXCEPTION 'Users cannot friend themselves.' USING ERRCODE = '23514';
    END IF;

    -- Only pending requests are permitted on INSERT
    IF NEW.status <> 'pending' THEN
      RAISE EXCEPTION 'New friendship requests must have status = pending (received: %).', NEW.status
        USING ERRCODE = '23514';
    END IF;

    IF auth.role() = 'authenticated' AND auth.uid() IS NOT NULL AND auth.uid() <> NEW.user_id THEN
      RAISE EXCEPTION 'Initiator user_id must match authenticated user.'
        USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.id <> OLD.id OR NEW.user_id <> OLD.user_id OR NEW.friend_id <> OLD.friend_id THEN
      RAISE EXCEPTION 'Friendship identity (id, user_id, friend_id) cannot be modified.' USING ERRCODE = '23514';
    END IF;

    IF NEW.user_id = NEW.friend_id THEN
      RAISE EXCEPTION 'Users cannot friend themselves.' USING ERRCODE = '23514';
    END IF;

    IF OLD.status = 'pending' AND NEW.status = 'accepted' AND auth.uid() IS NOT NULL AND auth.uid() = OLD.user_id THEN
      RAISE EXCEPTION 'Initiator cannot accept their own friend request.' USING ERRCODE = '42501';
    END IF;

    IF OLD.status = 'pending' AND NEW.status IN ('accepted', 'declined') AND auth.uid() IS NOT NULL AND auth.uid() <> OLD.friend_id THEN
      RAISE EXCEPTION 'Only the recipient can accept or decline a friend request.' USING ERRCODE = '42501';
    END IF;

    IF NEW.status = 'blocked' AND auth.uid() <> OLD.user_id AND auth.uid() <> OLD.friend_id THEN
      RAISE EXCEPTION 'Only friendship participants can block each other.' USING ERRCODE = '42501';
    END IF;

    IF OLD.status = 'blocked' AND NEW.status <> 'blocked' THEN
      RAISE EXCEPTION 'Blocked relationships cannot be changed directly.' USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

-- Idempotent attachment of future-date prevention triggers
DROP TRIGGER IF EXISTS trg_habit_completions_no_future ON public.habit_completions;
CREATE TRIGGER trg_habit_completions_no_future
  BEFORE INSERT OR UPDATE ON public.habit_completions
  FOR EACH ROW
  EXECUTE FUNCTION public.check_no_future_logs();

DROP TRIGGER IF EXISTS trg_workout_sessions_no_future ON public.workout_sessions;
CREATE TRIGGER trg_workout_sessions_no_future
  BEFORE INSERT OR UPDATE ON public.workout_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.check_no_future_logs();

-- Idempotent attachment of friendship immutability trigger
DROP TRIGGER IF EXISTS trg_friendship_immutability ON public.friendships;
CREATE TRIGGER trg_friendship_immutability
  BEFORE INSERT OR UPDATE ON public.friendships
  FOR EACH ROW
  EXECUTE FUNCTION public.check_friendship_immutability();

-- 8.3 Leaderboard RPCs: search_path hardened
CREATE OR REPLACE FUNCTION public.get_leaderboard(p_mode TEXT DEFAULT 'beast')
RETURNS TABLE (
  rank BIGINT,
  user_id UUID,
  name TEXT,
  avatar TEXT,
  consistency_percent NUMERIC,
  current_streak INT,
  workouts_completed INT,
  challenge_day INT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
  SELECT
    ROW_NUMBER() OVER (
      ORDER BY
        c.consistency_rate DESC,
        c.current_streak DESC,
        c.workouts_completed DESC,
        c.created_at ASC
    ) AS rank,
    CASE WHEN auth.uid() IS NOT NULL THEN p.id ELSE NULL END AS user_id,
    p.name,
    p.avatar,
    c.consistency_rate AS consistency_percent,
    c.current_streak,
    c.workouts_completed,
    GREATEST(1, LEAST(CURRENT_DATE, COALESCE(c.end_date, CURRENT_DATE)) - c.start_date + 1)::INT AS challenge_day
  FROM public.challenges c
  JOIN public.profiles p ON p.id = c.user_id
  WHERE c.mode = p_mode
    AND c.status = 'active'
    AND p.share_progress = TRUE
  ORDER BY rank ASC
  LIMIT 50;
$$;

CREATE OR REPLACE FUNCTION public.get_friends_leaderboard(p_mode TEXT DEFAULT 'beast')
RETURNS TABLE (
  rank BIGINT,
  user_id UUID,
  name TEXT,
  avatar TEXT,
  consistency_percent NUMERIC,
  current_streak INT,
  workouts_completed INT,
  challenge_day INT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
  SELECT
    ROW_NUMBER() OVER (
      ORDER BY
        c.consistency_rate DESC,
        c.current_streak DESC,
        c.workouts_completed DESC,
        c.created_at ASC
    ) AS rank,
    p.id AS user_id,
    p.name,
    p.avatar,
    c.consistency_rate AS consistency_percent,
    c.current_streak,
    c.workouts_completed,
    GREATEST(1, LEAST(CURRENT_DATE, COALESCE(c.end_date, CURRENT_DATE)) - c.start_date + 1)::INT AS challenge_day
  FROM public.challenges c
  JOIN public.profiles p ON p.id = c.user_id
  WHERE c.mode = p_mode
    AND c.status = 'active'
    AND auth.uid() IS NOT NULL
    AND (
      p.id = auth.uid()
      OR (
        p.share_progress = TRUE
        AND public.are_friends(auth.uid(), p.id)
      )
    )
  ORDER BY rank ASC
  LIMIT 50;
$$;


-- ------------------------------------------------------------------------------
-- 9. REVOKE & GRANT PERMISSIONS
-- ------------------------------------------------------------------------------

-- Revoke all default execution permissions from PUBLIC and anon
REVOKE ALL ON FUNCTION public.protect_challenge_score_fields() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.protect_challenge_score_fields() FROM anon;
REVOKE ALL ON FUNCTION public.protect_challenge_score_fields() FROM authenticated;

REVOKE ALL ON FUNCTION public.check_friendship_immutability() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_friendship_immutability() FROM anon;
REVOKE ALL ON FUNCTION public.check_friendship_immutability() FROM authenticated;

REVOKE ALL ON FUNCTION public.check_no_future_logs() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_no_future_logs() FROM anon;
REVOKE ALL ON FUNCTION public.check_no_future_logs() FROM authenticated;

REVOKE ALL ON FUNCTION public.calculate_authoritative_challenge_metrics(TEXT, UUID, DATE, DATE, TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.calculate_authoritative_challenge_metrics(TEXT, UUID, DATE, DATE, TEXT[]) FROM anon;
REVOKE ALL ON FUNCTION public.calculate_authoritative_challenge_metrics(TEXT, UUID, DATE, DATE, TEXT[]) FROM authenticated;

REVOKE ALL ON FUNCTION public.refresh_challenge_scores_on_habit_completion() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_challenge_scores_on_habit_completion() FROM anon;
REVOKE ALL ON FUNCTION public.refresh_challenge_scores_on_habit_completion() FROM authenticated;

REVOKE ALL ON FUNCTION public.refresh_challenge_scores_on_workout() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_challenge_scores_on_workout() FROM anon;
REVOKE ALL ON FUNCTION public.refresh_challenge_scores_on_workout() FROM authenticated;

REVOKE ALL ON FUNCTION public.is_blocked_between(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_blocked_between(UUID, UUID) FROM anon;

REVOKE ALL ON FUNCTION public.are_friends(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.are_friends(UUID, UUID) FROM anon;

REVOKE ALL ON FUNCTION public.is_group_member(TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_group_member(TEXT, UUID) FROM anon;

REVOKE ALL ON FUNCTION public.can_request_friendship(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_request_friendship(UUID) FROM anon;

REVOKE ALL ON FUNCTION public.get_leaderboard(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_leaderboard(TEXT) TO authenticated, anon;

REVOKE ALL ON FUNCTION public.get_friends_leaderboard(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_friends_leaderboard(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_friends_leaderboard(TEXT) TO authenticated;

-- Grant EXECUTE to authenticated ONLY on helper functions needed by RLS policies
GRANT EXECUTE ON FUNCTION public.is_blocked_between(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.are_friends(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_group_member(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_request_friendship(UUID) TO authenticated;

COMMIT;
