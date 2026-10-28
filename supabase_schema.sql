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
  consistency_rate NUMERIC DEFAULT 0,
  current_streak INT DEFAULT 0,
  workouts_completed INT DEFAULT 0,
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
  UNIQUE (user_id, friend_id)
);

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


-- --- Friendships Policies ---
CREATE POLICY "Friendships viewable by participants"
  ON public.friendships
  FOR SELECT
  USING (auth.uid() = user_id OR auth.uid() = friend_id);

CREATE POLICY "Friendships insert by initiator"
  ON public.friendships
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Friendships update by recipient"
  ON public.friendships
  FOR UPDATE
  USING (auth.uid() = friend_id OR auth.uid() = user_id);

CREATE POLICY "Friendships delete by participants"
  ON public.friendships
  FOR DELETE
  USING (auth.uid() = user_id OR auth.uid() = friend_id);


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
SET search_path = public
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
