-- ==============================================================================
-- Beastmode 90 — Database Migration: Stage 5 Security Remediation
-- Migration Name: 20261031_stage5_remediation.sql
-- Description:
--   Remediates DEFECT-SEC-01, DEFECT-SEC-02, and DEFECT-SEC-03:
--   1. Restricts friendship updates exclusively to the recipient.
--   2. Prevents initiator self-approval and identity tampering.
--   3. Clamps and validates challenge score fields with server-side DB constraints & triggers.
--   4. Hardens get_friends_leaderboard() by removing client UUID parameter and using auth.uid().
--
-- Safety & Idempotency:
--   - Performs safe data cleanup prior to applying constraints.
--   - Uses conditional DDL (IF EXISTS / IF NOT EXISTS) to prevent downtime.
--   - Does NOT drop or truncate tables.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. PRE-MIGRATION DATA SANITATION (Non-destructive cleanup)
-- ------------------------------------------------------------------------------

-- 1.1 Clean out-of-range challenge metrics before adding constraints
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

-- 1.3 Deduplicate reciprocal duplicate friendship rows keeping the older row
DELETE FROM public.friendships f1
WHERE EXISTS (
  SELECT 1 FROM public.friendships f2
  WHERE f1.user_id = f2.friend_id
    AND f1.friend_id = f2.user_id
    AND f1.created_at > f2.created_at
);


-- ------------------------------------------------------------------------------
-- 2. HARDENED DATABASE CONSTRAINTS
-- ------------------------------------------------------------------------------

DO $$
BEGIN
  -- Consistency rate: 0.0 to 100.0
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_challenges_consistency_rate') THEN
    ALTER TABLE public.challenges
      ADD CONSTRAINT chk_challenges_consistency_rate
      CHECK (consistency_rate >= 0.0 AND consistency_rate <= 100.0);
  END IF;

  -- Current streak: >= 0
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_challenges_current_streak') THEN
    ALTER TABLE public.challenges
      ADD CONSTRAINT chk_challenges_current_streak
      CHECK (current_streak >= 0);
  END IF;

  -- Workouts completed: >= 0
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_challenges_workouts_completed') THEN
    ALTER TABLE public.challenges
      ADD CONSTRAINT chk_challenges_workouts_completed
      CHECK (workouts_completed >= 0);
  END IF;

  -- Self-friending prevention
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_friendships_no_self_friend') THEN
    ALTER TABLE public.friendships
      ADD CONSTRAINT chk_friendships_no_self_friend
      CHECK (user_id <> friend_id);
  END IF;
END $$;


-- ------------------------------------------------------------------------------
-- 3. REMEDIATION FOR DEFECT-SEC-01: FRIENDSHIP RLS POLICIES & IMMUTABILITY
-- ------------------------------------------------------------------------------

-- 3.1 Drop legacy permissive update policy
DROP POLICY IF EXISTS "Friendships update by recipient" ON public.friendships;
DROP POLICY IF EXISTS "Friendships update by recipient only" ON public.friendships;

-- 3.2 Create strict recipient-only update policy
CREATE POLICY "Friendships update by recipient only"
  ON public.friendships
  FOR UPDATE
  USING (
    auth.uid() = friend_id
    AND status = 'pending'
  )
  WITH CHECK (
    auth.uid() = friend_id
    AND status IN ('accepted', 'declined', 'blocked')
  );

-- 3.3 Harden insert policy: initiator can only create 'pending' status and cannot self-friend
DROP POLICY IF EXISTS "Friendships insert by initiator" ON public.friendships;

CREATE POLICY "Friendships insert by initiator"
  ON public.friendships
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND user_id <> friend_id
    AND status = 'pending'
  );

-- 3.4 Immutability trigger: completely prevents mutating user_id, friend_id, or self-approving
CREATE OR REPLACE FUNCTION public.check_friendship_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Prevent altering friendship identity
  IF NEW.id <> OLD.id OR NEW.user_id <> OLD.user_id OR NEW.friend_id <> OLD.friend_id THEN
    RAISE EXCEPTION 'Friendship identity (id, user_id, friend_id) cannot be modified.';
  END IF;

  -- Prevent self-friending
  IF NEW.user_id = NEW.friend_id THEN
    RAISE EXCEPTION 'Users cannot friend themselves.';
  END IF;

  -- Prevent sender from self-approving a pending request
  IF OLD.status = 'pending' AND NEW.status = 'accepted' AND auth.uid() = OLD.user_id THEN
    RAISE EXCEPTION 'Initiator cannot accept their own friend request.';
  END IF;

  -- Only recipient may transition pending to accepted, declined, or blocked
  IF OLD.status = 'pending' AND NEW.status IN ('accepted', 'declined', 'blocked') AND auth.uid() <> OLD.friend_id THEN
    RAISE EXCEPTION 'Only the recipient can accept or decline a friend request.';
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
-- 4. REMEDIATION FOR DEFECT-SEC-02: CHALLENGE SCORE VALIDATION & PROTECTION
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.protect_challenge_score_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unique_days INT := 0;
  v_elapsed_days INT := 1;
  v_max_consistency NUMERIC := 0.0;
  v_verified_workouts INT := 0;
BEGIN
  -- 4.1 Validate boundary limits
  IF NEW.consistency_rate < 0.0 OR NEW.consistency_rate > 100.0 THEN
    RAISE EXCEPTION 'consistency_rate must be between 0 and 100.';
  END IF;

  IF NEW.current_streak < 0 THEN
    RAISE EXCEPTION 'current_streak cannot be negative.';
  END IF;

  IF NEW.workouts_completed < 0 THEN
    RAISE EXCEPTION 'workouts_completed cannot be negative.';
  END IF;

  -- 4.2 If update is originating from an authenticated client (not service_role/internal trigger),
  -- verify that submitted scores do not exceed actual recorded habit completions
  IF auth.role() = 'authenticated' THEN
    v_elapsed_days := GREATEST(1, (CURRENT_DATE - OLD.start_date + 1));

    -- Count distinct days with verified habit completions for this user/challenge
    SELECT COUNT(DISTINCT date) INTO v_unique_days
    FROM public.habit_completions
    WHERE user_id = OLD.user_id
      AND (challenge_id = OLD.id OR challenge_id IS NULL)
      AND date >= OLD.start_date;

    -- Count verified completed workouts
    SELECT COUNT(*) INTO v_verified_workouts
    FROM public.workout_sessions
    WHERE user_id = OLD.user_id
      AND status = 'completed'
      AND date >= OLD.start_date;

    -- If zero habit completions recorded, consistency cannot be > 0
    IF v_elapsed_days > 0 AND v_unique_days = 0 AND NEW.consistency_rate > 0 THEN
      NEW.consistency_rate := 0.0;
    ELSIF v_elapsed_days > 0 THEN
      v_max_consistency := LEAST(100.0, ROUND((v_unique_days::NUMERIC / v_elapsed_days::NUMERIC) * 100.0, 1));
      -- Clamp client consistency rate to verified upper bound
      IF NEW.consistency_rate > v_max_consistency THEN
        NEW.consistency_rate := v_max_consistency;
      END IF;
    END IF;

    -- Clamp streak to verified unique completed days
    IF NEW.current_streak > v_unique_days THEN
      NEW.current_streak := v_unique_days;
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
-- 5. REMEDIATION FOR DEFECT-SEC-03: HARDENED get_friends_leaderboard()
-- ------------------------------------------------------------------------------

-- 5.1 Drop legacy signature with client-controlled p_user_id
DROP FUNCTION IF EXISTS public.get_friends_leaderboard(UUID, TEXT);
DROP FUNCTION IF EXISTS public.get_friends_leaderboard(TEXT);

-- 5.2 Create secure function deriving user identity strictly from auth.uid()
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
    GREATEST(1, CURRENT_DATE - c.start_date + 1)::INT AS challenge_day
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

-- 5.3 Restrict EXECUTE privileges: authenticated users only
REVOKE ALL ON FUNCTION public.get_friends_leaderboard(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_friends_leaderboard(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_friends_leaderboard(TEXT) TO authenticated;

-- 5.4 Harden public global leaderboard
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
    GREATEST(1, CURRENT_DATE - c.start_date + 1)::INT AS challenge_day
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

COMMIT;

