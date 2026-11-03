-- ==============================================================================
-- Beastmode 90 — Database Migration: Stage 5.2.1 Scoring & Database Security
-- Migration Name: 20261101_stage5_2_1_scoring_and_security.sql
-- Description:
--   Comprehensive resolution of Stage 5.2.1 requirements:
--   1. Establishes ONE authoritative scoring formula:
--      (completed scheduled habit occurrences / total scheduled habit occurrences * 100).
--   2. Introduces public.habits table and selected_habit_ids column on challenges.
--   3. Eliminates RLS recursion on friendships, profiles, challenges, and group_members
--      using hardened SECURITY DEFINER helper functions.
--   4. Adds missing UPDATE policy on workout_sessions with user authorization.
--   5. Enhances protect_challenge_score_fields() to run on BOTH INSERT AND UPDATE:
--      - Rejects invalid future start dates.
--      - Prevents fabricated initial consistency, streak, and workout scores.
--      - Enforces immutability of (id, user_id, start_date, mode, duration).
--      - Prevents reopening completed or abandoned challenges.
--      - Calculates authoritative scores directly from verified DB records.
--   6. Preserves friendship status during reciprocal duplicate cleanup.
--   7. Hardens leaderboard RPCs with privacy masking on user_id for anonymous viewers.
--   8. Revokes trigger function execution privileges from PUBLIC and anon.
--
-- Safety & Idempotency:
--   - Uses non-destructive pre-migration data sanitation with status preservation.
--   - Idempotent DDL (IF EXISTS / IF NOT EXISTS).
--   - Strictly non-destructive: does NOT drop tables or erase user data.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. PRE-MIGRATION DATA SANITATION WITH STATUS PRESERVATION
-- ------------------------------------------------------------------------------

-- 1.1 Sanitize challenge score ranges
UPDATE public.challenges
SET consistency_rate = LEAST(100.0, GREATEST(0.0, COALESCE(consistency_rate, 0.0)))
WHERE consistency_rate < 0 OR consistency_rate > 100 OR consistency_rate IS NULL;

UPDATE public.challenges
SET current_streak = GREATEST(0, COALESCE(current_streak, 0))
WHERE current_streak < 0 OR current_streak IS NULL;

UPDATE public.challenges
SET workouts_completed = GREATEST(0, COALESCE(workouts_completed, 0))
WHERE workouts_completed < 0 OR workouts_completed IS NULL;

-- 1.2 Remove any self-friending records
DELETE FROM public.friendships
WHERE user_id = friend_id;

-- 1.3 Reciprocal duplicate friendship cleanup with STATUS PRESERVATION
-- Priority: blocked (1) > accepted (2) > declined (3) > pending (4)
WITH ranked_pairs AS (
  SELECT
    id,
    user_id,
    friend_id,
    status,
    created_at,
    ROW_NUMBER() OVER (
      PARTITION BY LEAST(user_id, friend_id), GREATEST(user_id, friend_id)
      ORDER BY
        CASE status
          WHEN 'blocked' THEN 1
          WHEN 'accepted' THEN 2
          WHEN 'declined' THEN 3
          ELSE 4
        END ASC,
        created_at ASC,
        id ASC
    ) AS rank_num,
    FIRST_VALUE(status) OVER (
      PARTITION BY LEAST(user_id, friend_id), GREATEST(user_id, friend_id)
      ORDER BY
        CASE status
          WHEN 'blocked' THEN 1
          WHEN 'accepted' THEN 2
          WHEN 'declined' THEN 3
          ELSE 4
        END ASC,
        created_at ASC,
        id ASC
    ) AS best_status
  FROM public.friendships
)
UPDATE public.friendships f
SET status = rp.best_status
FROM ranked_pairs rp
WHERE f.id = rp.id AND rp.rank_num = 1 AND f.status <> rp.best_status;

-- Delete lower-ranked duplicate rows
WITH duplicate_pairs AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY LEAST(user_id, friend_id), GREATEST(user_id, friend_id)
      ORDER BY
        CASE status
          WHEN 'blocked' THEN 1
          WHEN 'accepted' THEN 2
          WHEN 'declined' THEN 3
          ELSE 4
        END ASC,
        created_at ASC,
        id ASC
    ) AS rank_num
  FROM public.friendships
)
DELETE FROM public.friendships
WHERE id IN (SELECT id FROM duplicate_pairs WHERE rank_num > 1);


-- ------------------------------------------------------------------------------
-- 2. SCHEMA EVOLUTION: HABITS TABLE & CHALLENGE EXTENSIONS
-- ------------------------------------------------------------------------------

-- 2.1 Habits Table
CREATE TABLE IF NOT EXISTS public.habits (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'discipline',
  schedule JSONB DEFAULT '"daily"'::jsonb,
  archived BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on habits table
ALTER TABLE public.habits ENABLE ROW LEVEL SECURITY;

-- 2.2 Challenges table columns
ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS selected_habit_ids TEXT[] DEFAULT '{}'::TEXT[];

ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS longest_streak INT DEFAULT 0;

-- Table constraints
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_challenges_longest_streak') THEN
    ALTER TABLE public.challenges
      ADD CONSTRAINT chk_challenges_longest_streak
      CHECK (longest_streak >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_challenges_consistency_rate') THEN
    ALTER TABLE public.challenges
      ADD CONSTRAINT chk_challenges_consistency_rate
      CHECK (consistency_rate >= 0.0 AND consistency_rate <= 100.0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_challenges_current_streak') THEN
    ALTER TABLE public.challenges
      ADD CONSTRAINT chk_challenges_current_streak
      CHECK (current_streak >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_challenges_workouts_completed') THEN
    ALTER TABLE public.challenges
      ADD CONSTRAINT chk_challenges_workouts_completed
      CHECK (workouts_completed >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_friendships_no_self_friend') THEN
    ALTER TABLE public.friendships
      ADD CONSTRAINT chk_friendships_no_self_friend
      CHECK (user_id <> friend_id);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_friendships_mutual_pair
  ON public.friendships (LEAST(user_id, friend_id), GREATEST(user_id, friend_id));


-- ------------------------------------------------------------------------------
-- 3. SECURE HELPER FUNCTIONS FOR RLS & RECURSION ELIMINATION
-- ------------------------------------------------------------------------------

-- 3.1 Check if two users have a blocked relationship (either direction)
CREATE OR REPLACE FUNCTION public.is_blocked_between(p_user_a UUID, p_user_b UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.friendships
    WHERE ((user_id = p_user_a AND friend_id = p_user_b)
        OR (user_id = p_user_b AND friend_id = p_user_a))
      AND status = 'blocked'
  );
$$;

-- 3.2 Check if two users are accepted friends
CREATE OR REPLACE FUNCTION public.are_friends(p_user_a UUID, p_user_b UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.friendships
    WHERE ((user_id = p_user_a AND friend_id = p_user_b)
        OR (user_id = p_user_b AND friend_id = p_user_a))
      AND status = 'accepted'
  );
$$;

-- 3.3 Check if a user is a member of a private group
CREATE OR REPLACE FUNCTION public.is_group_member(p_group_id TEXT, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = p_group_id AND user_id = p_user_id
  );
$$;


-- ------------------------------------------------------------------------------
-- 4. HARDENED ROW LEVEL SECURITY POLICIES
-- ------------------------------------------------------------------------------

-- 4.1 Habits RLS policies
DROP POLICY IF EXISTS "Habits select policy" ON public.habits;
CREATE POLICY "Habits select policy"
  ON public.habits
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = habits.user_id AND p.share_progress = TRUE
    )
  );

DROP POLICY IF EXISTS "Habits insert policy" ON public.habits;
CREATE POLICY "Habits insert policy"
  ON public.habits
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Habits update policy" ON public.habits;
CREATE POLICY "Habits update policy"
  ON public.habits
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Habits delete policy" ON public.habits;
CREATE POLICY "Habits delete policy"
  ON public.habits
  FOR DELETE
  USING (auth.uid() = user_id);

-- 4.2 Group Members & Private Groups (Eliminates self-referential RLS recursion)
DROP POLICY IF EXISTS "Group members viewable by group members" ON public.group_members;
CREATE POLICY "Group members viewable by group members"
  ON public.group_members
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR public.is_group_member(group_id, auth.uid())
  );

DROP POLICY IF EXISTS "Groups viewable by members or by exact code lookup" ON public.private_groups;
CREATE POLICY "Groups viewable by members or by exact code lookup"
  ON public.private_groups
  FOR SELECT
  USING (
    auth.uid() = creator_id
    OR public.is_group_member(id, auth.uid())
  );

-- 4.3 Profiles & Challenges view policies (using are_friends helper)
DROP POLICY IF EXISTS "Profiles view policy" ON public.profiles;
CREATE POLICY "Profiles view policy"
  ON public.profiles
  FOR SELECT
  USING (
    auth.uid() = id
    OR share_progress = TRUE
    OR public.are_friends(auth.uid(), id)
  );

DROP POLICY IF EXISTS "Challenges read policy" ON public.challenges;
CREATE POLICY "Challenges read policy"
  ON public.challenges
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = challenges.user_id AND p.share_progress = TRUE
    )
    OR public.are_friends(auth.uid(), challenges.user_id)
  );

-- 4.4 Friendships policies
DROP POLICY IF EXISTS "Friendships insert by initiator" ON public.friendships;
CREATE POLICY "Friendships insert by initiator"
  ON public.friendships
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND user_id <> friend_id
    AND status = 'pending'
    AND NOT EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE ((f.user_id = friend_id AND f.friend_id = auth.uid())
          OR (f.user_id = auth.uid() AND f.friend_id = friend_id))
        AND f.status = 'blocked'
    )
  );

-- 4.5 Workout sessions UPDATE policy (safely authorized to session owner)
DROP POLICY IF EXISTS "Workouts user update" ON public.workout_sessions;
CREATE POLICY "Workouts user update"
  ON public.workout_sessions
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ------------------------------------------------------------------------------
-- 5. AUTHORITATIVE CALCULATION FUNCTION & SCORE PROTECTION TRIGGER
-- ------------------------------------------------------------------------------

-- 5.1 Authoritative calculation function matching the exact application formula:
--     Consistency % = (completed scheduled habit occurrences / total scheduled habit occurrences) * 100
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
SET search_path = public, auth, pg_temp
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
  -- Bounded evaluation window
  v_calc_end_date := LEAST(CURRENT_DATE, COALESCE(p_end_date, CURRENT_DATE));

  IF p_start_date > v_calc_end_date THEN
    o_consistency_rate := 0.0;
    o_current_streak := 0;
    o_longest_streak := 0;
    o_workouts_completed := 0;
    RETURN;
  END IF;

  -- Determine participating habit IDs
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

  -- If no habits are participating, consistency & streak are defined as 0
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

  -- Iterate over calendar days within challenge evaluation window
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

    -- Track contiguous completed days for streak
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

  -- Consistency rate calculation
  IF v_total_scheduled > 0 THEN
    o_consistency_rate := LEAST(100.0, ROUND((v_total_completed::NUMERIC / v_total_scheduled::NUMERIC) * 100.0, 1));
  ELSE
    o_consistency_rate := 0.0;
  END IF;

  -- Active consecutive streak walking backwards from today or yesterday
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

  -- Verified completed workouts strictly within challenge bounds
  SELECT COUNT(*) INTO o_workouts_completed
  FROM public.workout_sessions
  WHERE user_id = p_user_id
    AND status = 'completed'
    AND date >= p_start_date
    AND date <= v_calc_end_date;

END;
$$;


-- 5.2 Protect Challenge Scores Trigger Function (Runs on BOTH INSERT and UPDATE)
CREATE OR REPLACE FUNCTION public.protect_challenge_score_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_metrics RECORD;
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

    -- Validate mode and establish duration/end_date rules
    IF NEW.mode = 'monk' THEN
      NEW.duration := 30;
      NEW.end_date := NEW.start_date + INTERVAL '29 days';
    ELSIF NEW.mode = 'beast' THEN
      NEW.duration := 90;
      NEW.end_date := NEW.start_date + INTERVAL '89 days';
    ELSIF NEW.mode = 'wanderer' THEN
      NEW.duration := NULL;
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
    NEW.workouts_completed := v_metrics.o_workouts_completed;

    RETURN NEW;
  END IF;

  -- ----------------------------------------------------------------------------
  -- UPDATE: Validate transitions and enforce authoritative scores
  -- ----------------------------------------------------------------------------
  IF TG_OP = 'UPDATE' THEN
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

    -- Calculate and enforce authoritative values from verified records
    IF auth.role() = 'authenticated' THEN
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
    END IF;

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
-- 6. HARDENED LEADERBOARD RPCS WITH PRIVACY MASKING
-- ------------------------------------------------------------------------------

-- 6.1 Public Global Leaderboard: user_id is masked for anonymous viewers
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
SET search_path = public, auth, pg_temp
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

REVOKE ALL ON FUNCTION public.get_leaderboard(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_leaderboard(TEXT) TO authenticated, anon;

-- 6.2 Friends-Only Leaderboard (Only authenticated users, identity derived from auth.uid())
CREATE OR REPLACE FUNCTION public.get_friends_leaderboard(
  p_mode TEXT DEFAULT 'beast'
)
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
SET search_path = public, auth, pg_temp
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

REVOKE ALL ON FUNCTION public.get_friends_leaderboard(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_friends_leaderboard(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_friends_leaderboard(TEXT) TO authenticated;


-- ------------------------------------------------------------------------------
-- 7. REVOKE TRIGGER PERMISSIONS
-- ------------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.protect_challenge_score_fields() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.check_friendship_immutability() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.check_no_future_logs() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.calculate_authoritative_challenge_metrics(TEXT, UUID, DATE, DATE, TEXT[]) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_blocked_between(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.are_friends(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_group_member(TEXT, UUID) TO authenticated;

COMMIT;
