-- ==============================================================================
-- Beastmode 90 - PostgreSQL Database Schema & Row Level Security (RLS) Policies
-- ==============================================================================
-- Authoritative Schema Snapshot (Updated through Stage 5.2.1)
-- Enforces strict privacy: Food logs and body measurements are never shared.
-- Progress sharing is opt-in (share_progress = true).
-- Leaderboard rankings are calculated deterministically from verified habit & workout logs.
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
  selected_habit_ids TEXT[] DEFAULT '{}'::TEXT[],
  consistency_rate NUMERIC DEFAULT 0 CONSTRAINT chk_challenges_consistency_rate CHECK (consistency_rate >= 0.0 AND consistency_rate <= 100.0),
  current_streak INT DEFAULT 0 CONSTRAINT chk_challenges_current_streak CHECK (current_streak >= 0),
  longest_streak INT DEFAULT 0 CONSTRAINT chk_challenges_longest_streak CHECK (longest_streak >= 0),
  activity_streak INT DEFAULT 0 CONSTRAINT chk_challenges_activity_streak CHECK (activity_streak >= 0),
  workouts_completed INT DEFAULT 0 CONSTRAINT chk_challenges_workouts_completed CHECK (workouts_completed >= 0),
  CONSTRAINT chk_challenges_wanderer_null_end_date CHECK (mode <> 'wanderer' OR (end_date IS NULL AND duration IS NULL)),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Habits Table (Defines habits and schedules)
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

-- 4. Habit Completions Table
CREATE TABLE IF NOT EXISTS public.habit_completions (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  challenge_id TEXT REFERENCES public.challenges(id) ON DELETE SET NULL,
  habit_id TEXT NOT NULL,
  date DATE NOT NULL,
  completed_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Workout Sessions Table
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

-- 6. Private Food Logs Table (STRICT PRIVACY: NEVER EXPOSED TO OTHERS)
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

-- 7. Private Body Measurements Table (STRICT PRIVACY: NEVER EXPOSED TO OTHERS)
CREATE TABLE IF NOT EXISTS public.body_measurements (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  weight NUMERIC,
  waist NUMERIC,
  unit TEXT DEFAULT 'kg',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Friendships Table (Social connections)
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

-- 9. Private Groups Table
CREATE TABLE IF NOT EXISTS public.private_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL, -- 6-character invite code
  description TEXT,
  creator_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. Group Memberships
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
ALTER TABLE public.habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habit_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.body_measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.private_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;


-- ==============================================================================
-- SECURE HELPER FUNCTIONS FOR RLS & RECURSION PREVENTION
-- ==============================================================================

-- Check if two users have a blocked relationship (caller must be a participant)
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

-- Check if two users are accepted friends (caller must be a participant)
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

-- Check if a user is a member of a private group (caller must be member or group creator)
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

-- Check if caller can initiate friendship with target (server-derived identity, no RLS recursion)
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


-- ==============================================================================
-- ROW LEVEL SECURITY POLICIES
-- ==============================================================================

-- --- Profiles Policies ---
CREATE POLICY "Profiles view policy"
  ON public.profiles
  FOR SELECT
  USING (
    auth.uid() = id
    OR share_progress = TRUE
    OR public.are_friends(auth.uid(), id)
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


-- --- Habits Policies (STRICT PRIVACY: Names & Schedules are never exposed via share_progress) ---
CREATE POLICY "Habits select policy"
  ON public.habits
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Habits insert policy"
  ON public.habits
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Habits update policy"
  ON public.habits
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Habits delete policy"
  ON public.habits
  FOR DELETE
  USING (auth.uid() = user_id);


-- --- Challenges Policies ---
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
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ==============================================================================
-- CANONICAL HABIT SCHEDULE EVALUATION HELPER
-- ==============================================================================
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


-- ==============================================================================
-- AUTHORITATIVE CALCULATION FUNCTION & SCORE PROTECTION TRIGGER
-- ==============================================================================

-- Authoritative calculation function matching the exact application formula:
-- Consistency % = (completed scheduled habit occurrences / total scheduled habit occurrences) * 100
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

-- Protect challenge score fields trigger (Runs on BEFORE INSERT OR UPDATE)
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

-- Auto-refresh challenge scores on habit completion writes
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

-- Auto-refresh challenge scores on completed workout writes
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


-- --- Habit Completions Policies (STRICT PRIVACY: completions are private to the user) ---
CREATE POLICY "Habit completions read policy"
  ON public.habit_completions
  FOR SELECT
  USING (auth.uid() = user_id);

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

CREATE POLICY "Workouts user update"
  ON public.workout_sessions
  FOR UPDATE
  USING (auth.uid() = user_id)
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
SET search_path = pg_catalog, public, auth
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
    AND public.can_request_friendship(friend_id)
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

DROP TRIGGER IF EXISTS trg_friendship_immutability ON public.friendships;
CREATE TRIGGER trg_friendship_immutability
  BEFORE INSERT OR UPDATE ON public.friendships
  FOR EACH ROW
  EXECUTE FUNCTION public.check_friendship_immutability();


-- --- Private Groups Policies ---
CREATE POLICY "Groups viewable by members or by exact code lookup"
  ON public.private_groups
  FOR SELECT
  USING (
    auth.uid() = creator_id
    OR public.is_group_member(id, auth.uid())
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
    auth.uid() = user_id
    OR public.is_group_member(group_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = group_members.group_id AND gm.user_id = auth.uid()
    )
  );

CREATE POLICY "Group members insert"
  ON public.group_members
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);


-- ==============================================================================
-- SERVER-SIDE LEADERBOARD FUNCTION (With Anonymous Privacy Masking)
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

REVOKE ALL ON FUNCTION public.get_leaderboard(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_leaderboard(TEXT) TO authenticated, anon;


-- ==============================================================================
-- SERVER-SIDE FRIENDS-ONLY LEADERBOARD FUNCTION
-- Identity derived securely from auth.uid()
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

REVOKE ALL ON FUNCTION public.get_friends_leaderboard(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_friends_leaderboard(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_friends_leaderboard(TEXT) TO authenticated;


-- ==============================================================================
-- REVOKE & GRANT PERMISSIONS
-- Trigger/internal functions: revoke from everyone
-- Helper functions: revoke from PUBLIC/anon, grant only to authenticated
-- ==============================================================================
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

GRANT EXECUTE ON FUNCTION public.is_blocked_between(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.are_friends(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_group_member(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_request_friendship(UUID) TO authenticated;
