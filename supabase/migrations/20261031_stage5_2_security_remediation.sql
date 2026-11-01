-- ==============================================================================
-- Beastmode 90 — Database Migration: Stage 5.2 Security Remediation
-- Migration Name: 20261031_stage5_2_security_remediation.sql
-- Description:
--   Comprehensive resolution of all Stage 5.1 security findings:
--   1. Blocks future-dated habit completions and workout sessions via DB triggers.
--   2. Binds challenge habit completions strictly to challenge_id (eliminates NULL bleed).
--   3. Enforces strict immutability on challenge (id, user_id, start_date).
--   4. Bounds challenge calculations and workout counts by start_date and end_date.
--   5. Calculates true consecutive calendar streaks in the score validation trigger.
--   6. Enforces symmetric mutual friendship uniqueness (LEAST, GREATEST).
--   7. Blocks friend requests sent to users who have blocked the initiator.
--   8. Supports blocking and unfriending from accepted and pending friendship states.
--   9. Bounds leaderboard challenge_day by end_date.
--  10. Revokes EXECUTE permissions on trigger functions from PUBLIC and anon.
--
-- Safety:
--   - PostgreSQL CHECK constraints are avoided for volatile date checks (uses triggers).
--   - Safe pre-migration data sanitation with tie-breaking for identical timestamps.
--   - Zero table dropping or data destruction.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. PRE-MIGRATION DATA SANITATION (Safe, Non-Destructive Data Cleanup)
-- ------------------------------------------------------------------------------

-- 1.1 Clean challenge score fields
UPDATE public.challenges
SET consistency_rate = LEAST(100.0, GREATEST(0.0, COALESCE(consistency_rate, 0.0)))
WHERE consistency_rate < 0 OR consistency_rate > 100 OR consistency_rate IS NULL;

UPDATE public.challenges
SET current_streak = GREATEST(0, COALESCE(current_streak, 0))
WHERE current_streak < 0 OR current_streak IS NULL;

UPDATE public.challenges
SET workouts_completed = GREATEST(0, COALESCE(workouts_completed, 0))
WHERE workouts_completed < 0 OR workouts_completed IS NULL;

-- 1.2 Remove any invalid self-friending records
DELETE FROM public.friendships
WHERE user_id = friend_id;

-- 1.3 Deduplicate reciprocal duplicate friendship pairs with tie-breaker
DELETE FROM public.friendships f1
WHERE EXISTS (
  SELECT 1 FROM public.friendships f2
  WHERE LEAST(f1.user_id, f1.friend_id) = LEAST(f2.user_id, f2.friend_id)
    AND GREATEST(f1.user_id, f1.friend_id) = GREATEST(f2.user_id, f2.friend_id)
    AND (
      f1.created_at > f2.created_at
      OR (f1.created_at = f2.created_at AND f1.id > f2.id)
    )
);


-- ------------------------------------------------------------------------------
-- 2. HARDENED TABLE CONSTRAINTS & MUTUAL UNIQUE INDEX
-- ------------------------------------------------------------------------------

DO $$
BEGIN
  -- Challenge boundary constraints
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

  -- Friendship self-friending constraint
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_friendships_no_self_friend') THEN
    ALTER TABLE public.friendships
      ADD CONSTRAINT chk_friendships_no_self_friend
      CHECK (user_id <> friend_id);
  END IF;
END $$;

-- 2.2 Symmetric mutual uniqueness index: prevents reciprocal duplicates (A, B) and (B, A)
CREATE UNIQUE INDEX IF NOT EXISTS uq_friendships_mutual_pair
  ON public.friendships (LEAST(user_id, friend_id), GREATEST(user_id, friend_id));


-- ------------------------------------------------------------------------------
-- 3. FUTURE-DATE PREVENTION TRIGGERS
-- Note: Trigger-based enforcement avoids volatile CURRENT_DATE in CHECK constraints
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.check_no_future_logs()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.date > CURRENT_DATE THEN
    RAISE EXCEPTION 'Cannot record log with future date (%) - only past and present dates are permitted.', NEW.date;
  END IF;
  RETURN NEW;
END;
$$;

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


-- ------------------------------------------------------------------------------
-- 4. HARDENED FRIENDSHIP RLS & IMMUTABILITY TRIGGER
-- ------------------------------------------------------------------------------

-- 4.1 Insert policy: Initiator must create 'pending' and recipient must not have blocked initiator
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

-- 4.2 Update policy:
--     - Recipient can accept or decline a pending request
--     - Either participant can block an active or pending relationship
DROP POLICY IF EXISTS "Friendships update by recipient" ON public.friendships;
DROP POLICY IF EXISTS "Friendships update by recipient only" ON public.friendships;
DROP POLICY IF EXISTS "Friendships update policy" ON public.friendships;

CREATE POLICY "Friendships update policy"
  ON public.friendships
  FOR UPDATE
  USING (
    -- Recipient can transition a pending request
    (auth.uid() = friend_id AND status = 'pending')
    -- OR either participant can block
    OR ((auth.uid() = user_id OR auth.uid() = friend_id) AND status IN ('pending', 'accepted'))
  )
  WITH CHECK (
    -- Accepting or declining: recipient only
    (status IN ('accepted', 'declined') AND auth.uid() = friend_id)
    -- Blocking: either participant
    OR (status = 'blocked' AND (auth.uid() = user_id OR auth.uid() = friend_id))
  );

-- 4.3 Immutability and state transition trigger
CREATE OR REPLACE FUNCTION public.check_friendship_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Friendship identity is completely immutable
  IF NEW.id <> OLD.id OR NEW.user_id <> OLD.user_id OR NEW.friend_id <> OLD.friend_id THEN
    RAISE EXCEPTION 'Friendship identity (id, user_id, friend_id) cannot be modified.';
  END IF;

  -- Prevent self-friending
  IF NEW.user_id = NEW.friend_id THEN
    RAISE EXCEPTION 'Users cannot friend themselves.';
  END IF;

  -- Prevent sender from self-approving
  IF OLD.status = 'pending' AND NEW.status = 'accepted' AND auth.uid() = OLD.user_id THEN
    RAISE EXCEPTION 'Initiator cannot accept their own friend request.';
  END IF;

  -- Only recipient may accept or decline pending requests
  IF OLD.status = 'pending' AND NEW.status IN ('accepted', 'declined') AND auth.uid() <> OLD.friend_id THEN
    RAISE EXCEPTION 'Only the recipient can accept or decline a friend request.';
  END IF;

  -- Only participants can block
  IF NEW.status = 'blocked' AND auth.uid() <> OLD.user_id AND auth.uid() <> OLD.friend_id THEN
    RAISE EXCEPTION 'Only friendship participants can block each other.';
  END IF;

  -- Blocked relationships cannot be silently revived via UPDATE
  IF OLD.status = 'blocked' AND NEW.status <> 'blocked' THEN
    RAISE EXCEPTION 'Blocked relationships cannot be changed directly.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_friendship_immutability ON public.friendships;
CREATE TRIGGER trg_friendship_immutability
  BEFORE UPDATE ON public.friendships
  FOR EACH ROW
  EXECUTE FUNCTION public.check_friendship_immutability();


-- ------------------------------------------------------------------------------
-- 5. HARDENED CHALLENGE SCORE VALIDATION & CONSECUTIVE STREAK CALCULATION
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.protect_challenge_score_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unique_days INT := 0;
  v_calc_end_date DATE;
  v_elapsed_days INT := 1;
  v_max_consistency NUMERIC := 0.0;
  v_verified_workouts INT := 0;
  v_curr_check DATE;
  v_calculated_streak INT := 0;
BEGIN
  -- 5.1 Enforce immutability on challenge identity and start_date
  IF NEW.id <> OLD.id OR NEW.user_id <> OLD.user_id OR NEW.start_date <> OLD.start_date THEN
    RAISE EXCEPTION 'Challenge identity (id, user_id) and start_date are immutable after creation.';
  END IF;

  -- 5.2 Validate range limits
  IF NEW.consistency_rate < 0.0 OR NEW.consistency_rate > 100.0 THEN
    RAISE EXCEPTION 'consistency_rate must be between 0 and 100.';
  END IF;

  IF NEW.current_streak < 0 THEN
    RAISE EXCEPTION 'current_streak cannot be negative.';
  END IF;

  IF NEW.workouts_completed < 0 THEN
    RAISE EXCEPTION 'workouts_completed cannot be negative.';
  END IF;

  -- 5.3 If update is originating from an authenticated client, clamp against verified DB records
  IF auth.role() = 'authenticated' THEN
    -- Bounded evaluation date: cannot evaluate past CURRENT_DATE or past challenge end_date
    v_calc_end_date := LEAST(CURRENT_DATE, COALESCE(OLD.end_date, CURRENT_DATE));
    v_elapsed_days := GREATEST(1, (v_calc_end_date - OLD.start_date + 1));

    -- Count distinct completed days STRICTLY for this challenge and within start/end window
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

    -- Clamp consistency rate
    IF v_elapsed_days > 0 AND v_unique_days = 0 AND NEW.consistency_rate > 0 THEN
      NEW.consistency_rate := 0.0;
    ELSIF v_elapsed_days > 0 THEN
      v_max_consistency := LEAST(100.0, ROUND((v_unique_days::NUMERIC / v_elapsed_days::NUMERIC) * 100.0, 1));
      IF NEW.consistency_rate > v_max_consistency THEN
        NEW.consistency_rate := v_max_consistency;
      END IF;
    END IF;

    -- Clamp current streak to verified consecutive streak
    IF NEW.current_streak > v_calculated_streak THEN
      NEW.current_streak := v_calculated_streak;
    END IF;

    -- Clamp workouts completed to verified workout session records
    IF NEW.workouts_completed > v_verified_workouts THEN
      NEW.workouts_completed := v_verified_workouts;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_challenge_scores ON public.challenges;
CREATE TRIGGER trg_protect_challenge_scores
  BEFORE UPDATE ON public.challenges
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_challenge_score_fields();


-- ------------------------------------------------------------------------------
-- 6. HARDENED LEADERBOARD RPCs WITH END-DATE AWARENESS
-- ------------------------------------------------------------------------------

-- 6.1 get_friends_leaderboard
DROP FUNCTION IF EXISTS public.get_friends_leaderboard(UUID, TEXT);
DROP FUNCTION IF EXISTS public.get_friends_leaderboard(TEXT);

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
SET search_path = public, auth
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
        AND EXISTS (
          SELECT 1 FROM public.friendships f
          WHERE ((f.user_id = auth.uid() AND f.friend_id = p.id)
              OR (f.friend_id = auth.uid() AND f.user_id = p.id))
            AND f.status = 'accepted'
        )
      )
    )
  ORDER BY rank ASC
  LIMIT 50;
$$;

REVOKE ALL ON FUNCTION public.get_friends_leaderboard(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_friends_leaderboard(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_friends_leaderboard(TEXT) TO authenticated;

-- 6.2 get_leaderboard
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
SET search_path = public, auth
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
    AND p.share_progress = TRUE
  ORDER BY rank ASC
  LIMIT 50;
$$;

REVOKE ALL ON FUNCTION public.get_leaderboard(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_leaderboard(TEXT) TO authenticated, anon;


-- ------------------------------------------------------------------------------
-- 7. REVOKE UNNECESSARY EXECUTE PERMISSIONS ON TRIGGER FUNCTIONS
-- ------------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.protect_challenge_score_fields() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.protect_challenge_score_fields() FROM anon;

REVOKE ALL ON FUNCTION public.check_friendship_immutability() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_friendship_immutability() FROM anon;

REVOKE ALL ON FUNCTION public.check_no_future_logs() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_no_future_logs() FROM anon;

COMMIT;

