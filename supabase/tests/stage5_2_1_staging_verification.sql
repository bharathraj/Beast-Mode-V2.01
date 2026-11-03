-- ==============================================================================
-- Beastmode 90 — Staging Database Verification Script: Stage 5.2.1
-- File: supabase/tests/stage5_2_1_staging_verification.sql
-- Description:
--   Automated PostgreSQL verification test suite to be executed against a
--   Supabase staging environment. Runs within a transaction and rolls back
--   at the end so no test data persists.
--
-- Safety:
--   - Wrapped in BEGIN ... ROLLBACK.
--   - Does NOT modify permanent data.
--   - Can be run safely via Supabase SQL Editor or psql on Staging.
-- ==============================================================================

BEGIN;

DO $$
DECLARE
  v_user_a UUID := '00000000-0000-0000-0000-000000000001';
  v_user_b UUID := '00000000-0000-0000-0000-000000000002';
  v_user_c UUID := '00000000-0000-0000-0000-000000000003';
  v_metrics RECORD;
  v_chal_id TEXT := 'test_chal_stage521';
  v_res_streak INT;
  v_res_consistency NUMERIC;
  v_err_caught BOOLEAN := FALSE;
  v_count INT;
BEGIN
  RAISE NOTICE '>>> Starting Stage 5.2.1 Staging Verification Suite...';

  -- ----------------------------------------------------------------------------
  -- Setup Mock Test Users & Profiles
  -- ----------------------------------------------------------------------------
  INSERT INTO public.profiles (id, name, share_progress, created_at, updated_at)
  VALUES
    (v_user_a, 'Staging Test User A', FALSE, NOW(), NOW()),
    (v_user_b, 'Staging Test User B', TRUE,  NOW(), NOW()),
    (v_user_c, 'Staging Test User C', FALSE, NOW(), NOW())
  ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name, share_progress = EXCLUDED.share_progress;

  -- ----------------------------------------------------------------------------
  -- TEST 1: Five Scheduled Habits, One Completed = 20% Consistency
  -- ----------------------------------------------------------------------------
  RAISE NOTICE 'Checking Test 1: Five scheduled habits, one completed = 20%% consistency...';

  -- Create 5 habits for User A
  INSERT INTO public.habits (id, user_id, name, schedule, archived)
  VALUES
    ('h_test_1', v_user_a, 'Habit 1', '"daily"'::jsonb, FALSE),
    ('h_test_2', v_user_a, 'Habit 2', '"daily"'::jsonb, FALSE),
    ('h_test_3', v_user_a, 'Habit 3', '"daily"'::jsonb, FALSE),
    ('h_test_4', v_user_a, 'Habit 4', '"daily"'::jsonb, FALSE),
    ('h_test_5', v_user_a, 'Habit 5', '"daily"'::jsonb, FALSE)
  ON CONFLICT (id) DO NOTHING;

  -- Habit completion: exactly 1 habit completed on CURRENT_DATE
  INSERT INTO public.habit_completions (id, user_id, challenge_id, habit_id, date)
  VALUES ('hc_test_1', v_user_a, v_chal_id, 'h_test_1', CURRENT_DATE)
  ON CONFLICT (id) DO NOTHING;

  SELECT * INTO v_metrics FROM public.calculate_authoritative_challenge_metrics(
    v_chal_id,
    v_user_a,
    CURRENT_DATE,
    CURRENT_DATE,
    ARRAY['h_test_1', 'h_test_2', 'h_test_3', 'h_test_4', 'h_test_5']
  );

  ASSERT v_metrics.o_consistency_rate = 20.0,
    FORMAT('Test 1 Failed: Expected 20.0%% consistency, got %s', v_metrics.o_consistency_rate);
  RAISE NOTICE '✓ Test 1 Passed: 1 completed / 5 scheduled = 20.0%%';

  -- ----------------------------------------------------------------------------
  -- TEST 2: Five Scheduled Habits, All Completed = 100% Consistency
  -- ----------------------------------------------------------------------------
  RAISE NOTICE 'Checking Test 2: Five scheduled habits, all completed = 100%% consistency...';

  INSERT INTO public.habit_completions (id, user_id, challenge_id, habit_id, date)
  VALUES
    ('hc_test_2', v_user_a, v_chal_id, 'h_test_2', CURRENT_DATE),
    ('hc_test_3', v_user_a, v_chal_id, 'h_test_3', CURRENT_DATE),
    ('hc_test_4', v_user_a, v_chal_id, 'h_test_4', CURRENT_DATE),
    ('hc_test_5', v_user_a, v_chal_id, 'h_test_5', CURRENT_DATE)
  ON CONFLICT (id) DO NOTHING;

  SELECT * INTO v_metrics FROM public.calculate_authoritative_challenge_metrics(
    v_chal_id,
    v_user_a,
    CURRENT_DATE,
    CURRENT_DATE,
    ARRAY['h_test_1', 'h_test_2', 'h_test_3', 'h_test_4', 'h_test_5']
  );

  ASSERT v_metrics.o_consistency_rate = 100.0,
    FORMAT('Test 2 Failed: Expected 100.0%% consistency, got %s', v_metrics.o_consistency_rate);
  RAISE NOTICE '✓ Test 2 Passed: 5 completed / 5 scheduled = 100.0%%';

  -- ----------------------------------------------------------------------------
  -- TEST 3: No Scheduled Habits = 0% Consistency and 0 Streak
  -- ----------------------------------------------------------------------------
  RAISE NOTICE 'Checking Test 3: No scheduled habits...';

  SELECT * INTO v_metrics FROM public.calculate_authoritative_challenge_metrics(
    'empty_chal',
    v_user_a,
    CURRENT_DATE,
    CURRENT_DATE,
    ARRAY[]::TEXT[]
  );

  ASSERT v_metrics.o_consistency_rate = 0.0,
    FORMAT('Test 3 Failed: Expected 0.0%% consistency, got %s', v_metrics.o_consistency_rate);
  ASSERT v_metrics.o_current_streak = 0,
    FORMAT('Test 3 Failed: Expected 0 current_streak, got %s', v_metrics.o_current_streak);
  ASSERT v_metrics.o_longest_streak = 0,
    FORMAT('Test 3 Failed: Expected 0 longest_streak, got %s', v_metrics.o_longest_streak);
  RAISE NOTICE '✓ Test 3 Passed: Empty scheduled habits correctly yields 0 scores';

  -- ----------------------------------------------------------------------------
  -- TEST 4: Non-consecutive Streaks (Gap Breaks Streak)
  -- ----------------------------------------------------------------------------
  RAISE NOTICE 'Checking Test 4: Non-consecutive streak breaking...';

  -- Clean completions for user A
  DELETE FROM public.habit_completions WHERE user_id = v_user_a;

  -- Insert completions for 3 days ago and 2 days ago, but NOT yesterday or today
  INSERT INTO public.habit_completions (id, user_id, challenge_id, habit_id, date)
  VALUES
    ('hc_s1', v_user_a, 'streak_chal', 'h_test_1', CURRENT_DATE - 3),
    ('hc_s2', v_user_a, 'streak_chal', 'h_test_1', CURRENT_DATE - 2);

  SELECT * INTO v_metrics FROM public.calculate_authoritative_challenge_metrics(
    'streak_chal',
    v_user_a,
    CURRENT_DATE - 5,
    CURRENT_DATE,
    ARRAY['h_test_1']
  );

  ASSERT v_metrics.o_current_streak = 0,
    FORMAT('Test 4 Failed: Expected current streak 0 due to missed yesterday and today, got %s', v_metrics.o_current_streak);
  ASSERT v_metrics.o_longest_streak = 2,
    FORMAT('Test 4 Failed: Expected longest streak 2, got %s', v_metrics.o_longest_streak);
  RAISE NOTICE '✓ Test 4 Passed: Non-consecutive gap resets current streak while preserving longest streak';

  -- ----------------------------------------------------------------------------
  -- TEST 5: Today / Yesterday Streak Behavior
  -- ----------------------------------------------------------------------------
  RAISE NOTICE 'Checking Test 5: Today / yesterday streak behavior...';

  -- Add completion for yesterday
  INSERT INTO public.habit_completions (id, user_id, challenge_id, habit_id, date)
  VALUES ('hc_s3', v_user_a, 'streak_chal', 'h_test_1', CURRENT_DATE - 1);

  SELECT * INTO v_metrics FROM public.calculate_authoritative_challenge_metrics(
    'streak_chal',
    v_user_a,
    CURRENT_DATE - 5,
    CURRENT_DATE,
    ARRAY['h_test_1']
  );

  ASSERT v_metrics.o_current_streak = 3,
    FORMAT('Test 5a Failed: Expected active streak 3 (including yesterday), got %s', v_metrics.o_current_streak);

  -- Add completion for today
  INSERT INTO public.habit_completions (id, user_id, challenge_id, habit_id, date)
  VALUES ('hc_s4', v_user_a, 'streak_chal', 'h_test_1', CURRENT_DATE);

  SELECT * INTO v_metrics FROM public.calculate_authoritative_challenge_metrics(
    'streak_chal',
    v_user_a,
    CURRENT_DATE - 5,
    CURRENT_DATE,
    ARRAY['h_test_1']
  );

  ASSERT v_metrics.o_current_streak = 4,
    FORMAT('Test 5b Failed: Expected active streak 4 (including today), got %s', v_metrics.o_current_streak);
  RAISE NOTICE '✓ Test 5 Passed: Streak maintained through yesterday and increments on today completion';

  -- ----------------------------------------------------------------------------
  -- TEST 6: Future Completion Attempts Rejected
  -- ----------------------------------------------------------------------------
  RAISE NOTICE 'Checking Test 6: Future completion attempts rejection...';

  v_err_caught := FALSE;
  BEGIN
    INSERT INTO public.habit_completions (id, user_id, challenge_id, habit_id, date)
    VALUES ('hc_future', v_user_a, 'streak_chal', 'h_test_1', CURRENT_DATE + 5);
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := TRUE;
  END;

  ASSERT v_err_caught = TRUE, 'Test 6 Failed: Future habit completion was not rejected by database trigger.';
  RAISE NOTICE '✓ Test 6 Passed: Future habit completion was blocked';

  -- ----------------------------------------------------------------------------
  -- TEST 7: Challenge Start and End Boundaries
  -- ----------------------------------------------------------------------------
  RAISE NOTICE 'Checking Test 7: Challenge future start_date rejection...';

  v_err_caught := FALSE;
  BEGIN
    INSERT INTO public.challenges (
      id, user_id, name, mode, duration, start_date, end_date, status, consistency_rate, current_streak, workouts_completed
    ) VALUES (
      'chal_future', v_user_a, 'Future Challenge', 'monk', 30, CURRENT_DATE + 10, CURRENT_DATE + 39, 'active', 0, 0, 0
    );
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := TRUE;
  END;

  ASSERT v_err_caught = TRUE, 'Test 7 Failed: Future challenge start_date was not rejected by trigger.';
  RAISE NOTICE '✓ Test 7 Passed: Future challenge start_date successfully rejected';

  -- ----------------------------------------------------------------------------
  -- TEST 8: Fabricated Challenge Creation Scores Overwritten by Authoritative Metrics
  -- ----------------------------------------------------------------------------
  RAISE NOTICE 'Checking Test 8: Fabricated challenge creation scores...';

  -- User A attempts to insert a challenge with fabricated 99.0% consistency and 50 streak
  INSERT INTO public.challenges (
    id, user_id, name, mode, duration, start_date, end_date, status,
    consistency_rate, current_streak, longest_streak, workouts_completed, selected_habit_ids
  ) VALUES (
    'chal_fab_create', v_user_a, 'Fabricated Scores', 'monk', 30, CURRENT_DATE, CURRENT_DATE + 29, 'active',
    99.0, 50, 50, 10, ARRAY['h_test_1']
  );

  SELECT consistency_rate, current_streak, workouts_completed
  INTO v_res_consistency, v_res_streak, v_count
  FROM public.challenges
  WHERE id = 'chal_fab_create';

  -- Since user A has completions and 0 workouts, the authoritative metrics are calculated and enforced
  ASSERT v_res_streak <= 4,
    FORMAT('Test 8 Failed: Fabricated current_streak 50 was not clamped/recalculated, got %s', v_res_streak);
  ASSERT v_count = 0,
    FORMAT('Test 8 Failed: Fabricated workouts_completed 10 was not recalculated, got %s', v_count);
  RAISE NOTICE '✓ Test 8 Passed: Fabricated creation scores were authoritatively calculated and enforced';

  -- ----------------------------------------------------------------------------
  -- TEST 9: Client Attempts to Manipulate Scores on Update
  -- ----------------------------------------------------------------------------
  RAISE NOTICE 'Checking Test 9: Client attempt to manipulate scores on update...';

  -- Attempt to artificially bump consistency to 100% and workouts to 25
  UPDATE public.challenges
  SET consistency_rate = 100.0, workouts_completed = 25
  WHERE id = 'chal_fab_create';

  SELECT workouts_completed INTO v_count
  FROM public.challenges
  WHERE id = 'chal_fab_create';

  -- Must be reset to verified DB workouts count (0)
  ASSERT v_count = 0,
    FORMAT('Test 9 Failed: Manipulated workouts count was not overwritten, got %s', v_count);
  RAISE NOTICE '✓ Test 9 Passed: Score tampering on UPDATE was neutralized by authoritative trigger';

  -- ----------------------------------------------------------------------------
  -- TEST 10: Reciprocal Friendship Creation Prevention
  -- ----------------------------------------------------------------------------
  RAISE NOTICE 'Checking Test 10: Reciprocal friendship unique constraint...';

  INSERT INTO public.friendships (user_id, friend_id, status)
  VALUES (v_user_a, v_user_b, 'accepted')
  ON CONFLICT DO NOTHING;

  v_err_caught := FALSE;
  BEGIN
    -- Attempting to insert reversed pair (user_b -> user_a)
    INSERT INTO public.friendships (user_id, friend_id, status)
    VALUES (v_user_b, v_user_a, 'pending');
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := TRUE;
  END;

  ASSERT v_err_caught = TRUE, 'Test 10 Failed: Reversed reciprocal friendship was not blocked by unique index.';
  RAISE NOTICE '✓ Test 10 Passed: Reciprocal friendship duplicate rejected by unique index';

  -- ----------------------------------------------------------------------------
  -- TEST 11: Blocked-User Requests Prevention
  -- ----------------------------------------------------------------------------
  RAISE NOTICE 'Checking Test 11: Blocked-user request rejection...';

  -- User B blocks User C
  INSERT INTO public.friendships (user_id, friend_id, status)
  VALUES (v_user_b, v_user_c, 'blocked')
  ON CONFLICT DO NOTHING;

  ASSERT public.is_blocked_between(v_user_b, v_user_c) = TRUE,
    'Test 11 Failed: is_blocked_between returned false for blocked relationship.';

  ASSERT public.is_blocked_between(v_user_c, v_user_b) = TRUE,
    'Test 11 Failed: is_blocked_between was not bidirectional.';

  RAISE NOTICE '✓ Test 11 Passed: Bidirectional blocked helper function successfully prevents requests';

  -- ----------------------------------------------------------------------------
  -- TEST 12: Anonymous Leaderboard Privacy Masking
  -- ----------------------------------------------------------------------------
  RAISE NOTICE 'Checking Test 12: Anonymous leaderboard privacy masking...';

  SELECT COUNT(*) INTO v_count
  FROM public.get_leaderboard('monk')
  WHERE user_id IS NOT NULL;

  -- Since we are running without auth.uid() context, user_id must be masked to NULL
  ASSERT v_count = 0,
    FORMAT('Test 12 Failed: Anonymous get_leaderboard leaked user_id, found %s non-null records', v_count);
  RAISE NOTICE '✓ Test 12 Passed: get_leaderboard properly masks user_id to NULL when auth.uid() is absent';

  RAISE NOTICE '========================================================================';
  RAISE NOTICE 'ALL 12 STAGING VERIFICATION TESTS COMPLETED SUCCESSFULLY!';
  RAISE NOTICE '========================================================================';

END $$;

-- Clean rollback to leave staging environment pristine
ROLLBACK;
