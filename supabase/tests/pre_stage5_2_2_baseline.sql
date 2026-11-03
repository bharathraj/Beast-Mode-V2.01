-- ==============================================================================
-- Beastmode 90 — Genuine Pre-Stage-5.2.2 Baseline Schema Snapshot (Stage 5.2.1)
-- File: supabase/tests/pre_stage5_2_2_baseline.sql
-- Description:
--   Represents the exact, authoritative database schema at Stage 5.2.1,
--   prior to any Stage 5.2.2 forward migrations or schema extensions.
--   Used as the genuine pre-migration baseline in disposable CI validation.
-- ==============================================================================

BEGIN;

-- 1. Profiles Table (Extends auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  email TEXT,
  avatar TEXT DEFAULT '⚡',
  height NUMERIC,
  height_unit TEXT DEFAULT 'cm',
  share_progress BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Challenges Table (Stage 5.2.1 state: 4 metric columns, selected_habit_ids, NO activity_streak, NO wanderer check)
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
  workouts_completed INT DEFAULT 0 CONSTRAINT chk_challenges_workouts_completed CHECK (workouts_completed >= 0),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Habits Table
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

-- 6. Private Food Logs Table (STRICT PRIVACY)
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

-- 7. Private Body Measurements Table (STRICT PRIVACY)
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

CREATE UNIQUE INDEX IF NOT EXISTS uq_friendships_mutual_pair
  ON public.friendships (LEAST(user_id, friend_id), GREATEST(user_id, friend_id));

-- 9. Private Groups Table
CREATE TABLE IF NOT EXISTS public.private_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
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

-- ------------------------------------------------------------------------------
-- STAGE 5.2.1 SECURITY DEFINER HELPER FUNCTIONS
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_blocked_between(p_user_a UUID, p_user_b UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.friendships
    WHERE ((user_id = p_user_a AND friend_id = p_user_b)
        OR (user_id = p_user_b AND friend_id = p_user_a))
      AND status = 'blocked'
  );
$$;

CREATE OR REPLACE FUNCTION public.are_friends(p_user_a UUID, p_user_b UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.friendships
    WHERE ((user_id = p_user_a AND friend_id = p_user_b)
        OR (user_id = p_user_b AND friend_id = p_user_a))
      AND status = 'accepted'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_group_member(p_group_id TEXT, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = p_group_id AND user_id = p_user_id
  );
$$;

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
-- STAGE 5.2.1 AUTHORITATIVE SCORING METRICS (4 OUT PARAMETERS)
-- ------------------------------------------------------------------------------
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

-- ------------------------------------------------------------------------------
-- STAGE 5.2.1 SCORE PROTECTION TRIGGER
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

DROP TRIGGER IF EXISTS trg_protect_challenge_scores ON public.challenges;
CREATE TRIGGER trg_protect_challenge_scores
  BEFORE INSERT OR UPDATE ON public.challenges
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_challenge_score_fields();

-- ------------------------------------------------------------------------------
-- FUTURE DATE & IMMUTABILITY TRIGGERS
-- ------------------------------------------------------------------------------
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

-- ------------------------------------------------------------------------------
-- RLS POLICIES FOR STAGE 5.2.1
-- ------------------------------------------------------------------------------
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

-- Profiles
CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Challenges
CREATE POLICY "Challenges select policy" ON public.challenges FOR SELECT USING (
  auth.uid() = user_id
  OR (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = challenges.user_id AND p.share_progress = true)
    AND public.are_friends(auth.uid(), challenges.user_id)
  )
);
CREATE POLICY "Challenges user insert" ON public.challenges FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Challenges user update" ON public.challenges FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Habits & Completions
CREATE POLICY "Habits select policy" ON public.habits FOR SELECT USING (
  auth.uid() = user_id
  OR (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = habits.user_id AND p.share_progress = true)
    AND public.are_friends(auth.uid(), habits.user_id)
  )
);
CREATE POLICY "Habits insert policy" ON public.habits FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Habits update policy" ON public.habits FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Habits delete policy" ON public.habits FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Habit completions select policy" ON public.habit_completions FOR SELECT USING (
  auth.uid() = user_id
  OR (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = habit_completions.user_id AND p.share_progress = true)
    AND public.are_friends(auth.uid(), habit_completions.user_id)
  )
);
CREATE POLICY "Habit completions insert policy" ON public.habit_completions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Habit completions update policy" ON public.habit_completions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Habit completions delete policy" ON public.habit_completions FOR DELETE USING (auth.uid() = user_id);

-- Workouts
CREATE POLICY "Workout sessions select policy" ON public.workout_sessions FOR SELECT USING (
  auth.uid() = user_id
  OR (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = workout_sessions.user_id AND p.share_progress = true)
    AND public.are_friends(auth.uid(), workout_sessions.user_id)
  )
);
CREATE POLICY "Workout sessions insert policy" ON public.workout_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Workout sessions update policy" ON public.workout_sessions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Workout sessions delete policy" ON public.workout_sessions FOR DELETE USING (auth.uid() = user_id);

-- Meals & Measurements (Strict Privacy)
CREATE POLICY "Users can only view their own meal entries" ON public.meal_entries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own meal entries" ON public.meal_entries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own meal entries" ON public.meal_entries FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own meal entries" ON public.meal_entries FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can only view their own body measurements" ON public.body_measurements FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own body measurements" ON public.body_measurements FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own body measurements" ON public.body_measurements FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own body measurements" ON public.body_measurements FOR DELETE USING (auth.uid() = user_id);

-- Friendships
CREATE POLICY "Friendships viewable by participants" ON public.friendships FOR SELECT USING (auth.uid() = user_id OR auth.uid() = friend_id);
CREATE POLICY "Friendships insert by initiator" ON public.friendships FOR INSERT WITH CHECK (
  auth.uid() = user_id
  AND user_id <> friend_id
  AND status = 'pending'
  AND public.can_request_friendship(friend_id)
);
CREATE POLICY "Friendships update by participants" ON public.friendships FOR UPDATE USING (
  (auth.uid() = friend_id AND status = 'pending')
  OR ((auth.uid() = user_id OR auth.uid() = friend_id) AND status IN ('pending', 'accepted'))
);
CREATE POLICY "Friendships delete by participants" ON public.friendships FOR DELETE USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- Private Groups & Members
CREATE POLICY "Groups viewable by members or by exact code lookup" ON public.private_groups FOR SELECT USING (
  auth.uid() = creator_id OR public.is_group_member(id, auth.uid())
);
CREATE POLICY "Groups insert by authenticated users" ON public.private_groups FOR INSERT WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "Group members viewable by group members" ON public.group_members FOR SELECT USING (
  public.is_group_member(group_id, auth.uid())
);
CREATE POLICY "Group members insert" ON public.group_members FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Leaderboards
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

REVOKE ALL ON FUNCTION public.is_blocked_between(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_blocked_between(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_blocked_between(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.are_friends(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.are_friends(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.are_friends(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.is_group_member(TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_group_member(TEXT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_group_member(TEXT, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.can_request_friendship(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_request_friendship(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_request_friendship(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.get_leaderboard(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_leaderboard(TEXT) TO authenticated, anon;

REVOKE ALL ON FUNCTION public.get_friends_leaderboard(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_friends_leaderboard(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_friends_leaderboard(TEXT) TO authenticated;

COMMIT;

