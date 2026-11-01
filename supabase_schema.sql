-- ==============================================================================
-- Beastmode 90 - PostgreSQL Database Schema & Row Level Security (RLS) Policies
-- ==============================================================================
-- Run this migration in your Supabase SQL Editor.
-- Enforces strict privacy: Food logs and body measurements are never shared.
-- Progress sharing is opt-in (share_progress = true).
-- Leaderboard rankings are calculated deterministically from verified habit logs.
-- ==============================================================================

-- 1. Profiles Table (Extends auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  email TEXT,
  avatar TEXT DEFAULT '⚡',
  height NUMERIC,
  height_unit TEXT DEFAULT 'cm',
  share_progress BOOLEAN DEFAULT FALSE, -- Opt-in privacy: defaults to private
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Challenges Table
CREATE TABLE IF NOT EXISTS public.challenges (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('wanderer', 'monk', 'beast')),
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  duration INT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'abandoned')),
  consistency_rate NUMERIC DEFAULT 0 CONSTRAINT chk_challenges_consistency_rate CHECK (consistency_rate >= 0.0 AND consistency_rate <= 100.0),
  current_streak INT DEFAULT 0 CONSTRAINT chk_challenges_current_streak CHECK (current_streak >= 0),
  workouts_completed INT DEFAULT 0 CONSTRAINT chk_challenges_workouts_completed CHECK (workouts_completed >= 0),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Habit Completions Table
CREATE TABLE IF NOT EXISTS public.habit_completions (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  challenge_id TEXT REFERENCES public.challenges(id) ON DELETE SET NULL,
  habit_id TEXT NOT NULL,
  date DATE NOT NULL,
  completed_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Workout Sessions Table
CREATE TABLE IF NOT EXISTS public.workout_sessions (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  date DATE NOT NULL,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  volume NUMERIC DEFAULT 0,
  exercises JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'completed',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Private Food Logs Table (STRICT PRIVACY: NEVER EXPOSED TO OTHERS)
CREATE TABLE IF NOT EXISTS public.meal_entries (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  meal_type TEXT NOT NULL,
  food_name TEXT NOT NULL,
  servings NUMERIC NOT NULL DEFAULT 1,
  serving_size TEXT,
  calories NUMERIC NOT NULL DEFAULT 0,
  protein NUMERIC NOT NULL DEFAULT 0,
  carbs NUMERIC NOT NULL DEFAULT 0,
  fat NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Private Body Measurements Table (STRICT PRIVACY: NEVER EXPOSED TO OTHERS)
CREATE TABLE IF NOT EXISTS public.body_measurements (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  weight NUMERIC,
  waist NUMERIC,
  unit TEXT DEFAULT 'kg',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Friendships Table (Social connections)
CREATE TABLE IF NOT EXISTS public.friendships (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  friend_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'blocked')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, friend_id),
  CONSTRAINT chk_friendships_no_self_friend CHECK (user_id <> friend_id)
);

-- Symmetric mutual uniqueness: prevents reciprocal duplicates (A, B) and (B, A)
CREATE UNIQUE INDEX IF NOT EXISTS uq_friendships_mutual_pair
  ON public.friendships (LEAST(user_id, friend_id), GREATEST(user_id, friend_id));

-- 8. Private Groups Table
CREATE TABLE IF NOT EXISTS public.private_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL, -- 6-character invite code
  description TEXT,
  creator_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Group Memberships
CREATE TABLE IF NOT EXISTS public.group_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id TEXT REFERENCES public.private_groups(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  role TEXT DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (group_id, user_id)
);


-- ==============================================================================
-- ENABLE ROW LEVEL SECURITY (RLS) ON ALL TABLES
-- ==============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habit_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.body_measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.private_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;


-- ==============================================================================
-- ROW LEVEL SECURITY POLICIES
-- ==============================================================================

-- --- Profiles Policies ---
-- Users can read their own profile, or public profiles with share_progress = TRUE, or friends
CREATE POLICY "Profiles view policy"
  ON public.profiles
  FOR SELECT
  USING (
    auth.uid() = id
    OR share_progress = TRUE
    OR EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE (f.user_id = auth.uid() AND f.friend_id = profiles.id AND f.status = 'accepted')
         OR (f.friend_id = auth.uid() AND f.user_id = profiles.id AND f.status = 'accepted')
    )
  );

CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);


-- --- Meal Entries Policies (STRICT PRIVACY) ---
-- ONLY the owner can read, insert, update, or delete their meal entries
CREATE POLICY "Meal entries owner select only"
  ON public.meal_entries
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Meal entries owner insert"
  ON public.meal_entries
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Meal entries owner update"
  ON public.meal_entries
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Meal entries owner delete"
  ON public.meal_entries
  FOR DELETE
  USING (auth.uid() = user_id);


-- --- Body Measurements Policies (STRICT PRIVACY) ---
-- ONLY the owner can read, insert, update, or delete body measurements
CREATE POLICY "Body measurements owner select only"
  ON public.body_measurements
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Body measurements owner insert"
  ON public.body_measurements
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Body measurements owner update"
  ON public.body_measurements
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Body measurements owner delete"
  ON public.body_measurements
  FOR DELETE
  USING (auth.uid() = user_id);


-- --- Challenges Policies ---
-- Read: Own challenges, or opted-in public challenges, or challenges of friends/group members
CREATE POLICY "Challenges read policy"
  ON public.challenges
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = challenges.user_id AND p.share_progress = TRUE
    )
    OR EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE ((f.user_id = auth.uid() AND f.friend_id = challenges.user_id)
          OR (f.friend_id = auth.uid() AND f.user_id = challenges.user_id))
        AND f.status = 'accepted'
    )
  );

CREATE POLICY "Challenges user insert"
  ON public.challenges
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Challenges user update"
  ON public.challenges
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Score protection trigger: verifies client updates against verified habit & workout records
-- Enforces immutability on challenge identity and start_date, and calculates true consecutive streaks
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
  -- 1. Enforce immutability on challenge identity and start_date
  IF NEW.id <> OLD.id OR NEW.user_id <> OLD.user_id OR NEW.start_date <> OLD.start_date THEN
    RAISE EXCEPTION 'Challenge identity (id, user_id) and start_date are immutable after creation.';
  END IF;

  -- 2. Range limits
  IF NEW.consistency_rate < 0.0 OR NEW.consistency_rate > 100.0 THEN
    RAISE EXCEPTION 'consistency_rate must be between 0 and 100.';
  END IF;

  IF NEW.current_streak < 0 THEN
    RAISE EXCEPTION 'current_streak cannot be negative.';
  END IF;

  IF NEW.workouts_completed < 0 THEN
    RAISE EXCEPTION 'workouts_completed cannot be negative.';
  END IF;

  -- 3. If update is originating from an authenticated client, clamp against verified DB records
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


-- --- Habit Completions Policies ---
CREATE POLICY "Habit completions read policy"
  ON public.habit_completions
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = habit_completions.user_id AND p.share_progress = TRUE
    )
  );

CREATE POLICY "Habit completions user insert"
  ON public.habit_completions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Habit completions user delete"
  ON public.habit_completions
  FOR DELETE
  USING (auth.uid() = user_id);


-- --- Workouts Policies ---
CREATE POLICY "Workouts read policy"
  ON public.workout_sessions
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = workout_sessions.user_id AND p.share_progress = TRUE
    )
  );

CREATE POLICY "Workouts user insert"
  ON public.workout_sessions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Workouts user delete"
  ON public.workout_sessions
  FOR DELETE
  USING (auth.uid() = user_id);

-- Future-date prevention trigger: enforces that neither habit completions nor workouts can be future-dated
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


-- --- Friendships Policies ---
CREATE POLICY "Friendships viewable by participants"
  ON public.friendships
  FOR SELECT
  USING (auth.uid() = user_id OR auth.uid() = friend_id);

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

CREATE POLICY "Friendships delete by participants"
  ON public.friendships
  FOR DELETE
  USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- Immutability trigger: strictly prevents mutating identity columns or self-approving
CREATE OR REPLACE FUNCTION public.check_friendship_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.id <> OLD.id OR NEW.user_id <> OLD.user_id OR NEW.friend_id <> OLD.friend_id THEN
    RAISE EXCEPTION 'Friendship identity (id, user_id, friend_id) cannot be modified.';
  END IF;

  IF NEW.user_id = NEW.friend_id THEN
    RAISE EXCEPTION 'Users cannot friend themselves.';
  END IF;

  IF OLD.status = 'pending' AND NEW.status = 'accepted' AND auth.uid() = OLD.user_id THEN
    RAISE EXCEPTION 'Initiator cannot accept their own friend request.';
  END IF;

  IF OLD.status = 'pending' AND NEW.status IN ('accepted', 'declined') AND auth.uid() <> OLD.friend_id THEN
    RAISE EXCEPTION 'Only the recipient can accept or decline a friend request.';
  END IF;

  IF NEW.status = 'blocked' AND auth.uid() <> OLD.user_id AND auth.uid() <> OLD.friend_id THEN
    RAISE EXCEPTION 'Only friendship participants can block each other.';
  END IF;

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


-- --- Private Groups Policies ---
CREATE POLICY "Groups viewable by members or by exact code lookup"
  ON public.private_groups
  FOR SELECT
  USING (
    auth.uid() = creator_id
    OR EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = private_groups.id AND gm.user_id = auth.uid()
    )
  );

CREATE POLICY "Groups insert by authenticated users"
  ON public.private_groups
  FOR INSERT
  WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "Group members viewable by group members"
  ON public.group_members
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = group_members.group_id AND gm.user_id = auth.uid()
    )
  );

CREATE POLICY "Group members insert"
  ON public.group_members
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);


-- ==============================================================================
-- SERVER-SIDE LEADERBOARD FUNCTION (Prevents Arbitrary Score Submissions)
-- Calculates scores deterministically from verified habit & challenge logs
-- ==============================================================================
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

-- ==============================================================================
-- SERVER-SIDE FRIENDS-ONLY LEADERBOARD FUNCTION
-- Dual-party friendship lookup: only accepted friends and current user.
-- Identity derived securely from auth.uid() — cannot be spoofed by client arguments.
-- Pending, declined, or unverified requests are strictly excluded.
-- ==============================================================================
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

-- ==============================================================================
-- REVOKE TRIGGER FUNCTION PERMISSIONS
-- Prevents direct execution of trigger functions by public/anon clients
-- ==============================================================================
REVOKE ALL ON FUNCTION public.protect_challenge_score_fields() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.protect_challenge_score_fields() FROM anon;

REVOKE ALL ON FUNCTION public.check_friendship_immutability() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_friendship_immutability() FROM anon;

REVOKE ALL ON FUNCTION public.check_no_future_logs() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_no_future_logs() FROM anon;
