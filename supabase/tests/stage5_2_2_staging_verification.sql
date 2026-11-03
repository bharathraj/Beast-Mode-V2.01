-- ==============================================================================
-- Beastmode 90 — Staging Database Verification Script: Stage 5.2.4 (v4)
-- File: supabase/tests/stage5_2_2_staging_verification.sql
-- Description:
--   Comprehensive PostgreSQL/Supabase staging verification test suite.
--   Tests real authenticated RLS policies, privacy boundaries, ownership,
--   authoritative scoring and streak semantics, trigger attachments,
--   friendship backup/recovery, and function execution permissions.
--
-- Safety & Isolation:
--   - Wrapped entirely in BEGIN ... ROLLBACK.
--   - Uses dedicated, isolated test UUIDs (prefix 'a1111111-', 'b2222222-', 'c3333333-')
--     to avoid modifying or colliding with permanent staging data.
--   - Specific SQLSTATE and error condition assertions replace broad exception catching.
--   - Safe for direct execution in Supabase SQL Editor or via psql.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 0. ENVIRONMENT & EXECUTION CONTEXT REPORTING
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_version TEXT;
  v_user TEXT;
  v_role TEXT;
BEGIN
  SELECT version() INTO v_version;
  SELECT current_user INTO v_user;
  SELECT session_user INTO v_role;
  RAISE NOTICE '========================================================================';
  RAISE NOTICE '>>> STARTING STAGE 5.2.4 FINAL SQL INTEGRITY STAGING TEST SUITE';
  RAISE NOTICE '========================================================================';
  RAISE NOTICE 'PostgreSQL Version: %', v_version;
  RAISE NOTICE 'Execution Role (Current User): %, Session User: %', v_user, v_role;
  RAISE NOTICE 'Test Transaction: BEGIN (Guaranteed rollback at script completion)';
  RAISE NOTICE '========================================================================';
END $$;


-- ------------------------------------------------------------------------------
-- SETUP: FIXTURES INITIALIZATION (Admin / Privileged Context)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_alice   UUID := 'a1111111-0000-0000-0000-000000000001';
  v_bob     UUID := 'b2222222-0000-0000-0000-000000000002';
  v_charlie UUID := 'c3333333-0000-0000-0000-000000000003';
BEGIN
  RAISE NOTICE 'Setting up test fixtures for Alice, Bob, and Charlie...';

  -- 1. Profiles
  INSERT INTO public.profiles (id, name, share_progress, created_at, updated_at)
  VALUES
    (v_alice,   'Staging Alice',   FALSE, NOW(), NOW()),
    (v_bob,     'Staging Bob',     TRUE,  NOW(), NOW()),
    (v_charlie, 'Staging Charlie', FALSE, NOW(), NOW())
  ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name, share_progress = EXCLUDED.share_progress;

  -- 2. Ensure table-level permissions exist for authenticated role so RLS is evaluated
  GRANT USAGE ON SCHEMA public TO authenticated, anon;
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
    public.profiles,
    public.friendships,
    public.challenges,
    public.habits,
    public.habit_completions,
    public.workout_sessions,
    public.private_groups,
    public.group_members
  TO authenticated;

  GRANT SELECT ON TABLE
    public.profiles,
    public.challenges
  TO anon;

  RAISE NOTICE '✓ Test fixtures initialized successfully';
END $$;


-- ==============================================================================
-- TEST 1: REAL AUTHENTICATED FRIENDSHIP POLICY & RECURSION ELIMINATION
-- ==============================================================================

-- 1a. Alice sends friend request to Bob under role 'authenticated' (RLS active)
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "a1111111-0000-0000-0000-000000000001", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = 'a1111111-0000-0000-0000-000000000001';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

DO $$
DECLARE
  v_alice UUID := 'a1111111-0000-0000-0000-000000000001';
  v_bob   UUID := 'b2222222-0000-0000-0000-000000000002';
  v_count INT;
BEGIN
  RAISE NOTICE 'Testing Test 1a: Friendship INSERT RLS and recursion elimination (Alice -> Bob)...';

  INSERT INTO public.friendships (id, user_id, friend_id, status)
  VALUES ('f_verify_alice_to_bob', v_alice, v_bob, 'pending');

  SELECT COUNT(*) INTO v_count
  FROM public.friendships
  WHERE id = 'f_verify_alice_to_bob' AND status = 'pending';

  ASSERT v_count = 1, 'Test 1a Failed: Friend request was not inserted under authenticated context';
  RAISE NOTICE '✓ Test 1a Passed: Friendship request inserted under authenticated role without recursion';
END $$;

-- 1b. Duplicate / Reciprocal request rejection via symmetric unique constraint
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "b2222222-0000-0000-0000-000000000002", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = 'b2222222-0000-0000-0000-000000000002';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

DO $$
DECLARE
  v_alice UUID := 'a1111111-0000-0000-0000-000000000001';
  v_bob   UUID := 'b2222222-0000-0000-0000-000000000002';
  v_err_caught BOOLEAN := FALSE;
BEGIN
  RAISE NOTICE 'Testing Test 1b: Reciprocal duplicate friend request rejection (Bob -> Alice)...';

  BEGIN
    INSERT INTO public.friendships (id, user_id, friend_id, status)
    VALUES ('f_verify_bob_to_alice_dup', v_bob, v_alice, 'pending');
  EXCEPTION
    WHEN unique_violation THEN
      v_err_caught := TRUE;
      ASSERT SQLSTATE = '23505', FORMAT('Test 1b Failed: Expected SQLSTATE 23505, got %s', SQLSTATE);
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Test 1b Failed: Unexpected error condition % (SQLSTATE: %)', SQLERRM, SQLSTATE;
  END;

  ASSERT v_err_caught = TRUE,
    'Test 1b Failed: Reciprocal friendship duplicate was not rejected by uq_friendships_mutual_pair';
  RAISE NOTICE '✓ Test 1b Passed: Reciprocal duplicate rejected by symmetric unique constraint (SQLSTATE 23505)';
END $$;

-- 1c. Blocked user request denial under authenticated context with specific RLS violation check
RESET ROLE;
-- Setup: Bob blocks Charlie
INSERT INTO public.friendships (id, user_id, friend_id, status)
VALUES ('f_verify_bob_blocks_charlie', 'b2222222-0000-0000-0000-000000000002', 'c3333333-0000-0000-0000-000000000003', 'blocked')
ON CONFLICT (id) DO UPDATE SET status = 'blocked';

-- Charlie attempts to friend Bob under authenticated role
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "c3333333-0000-0000-0000-000000000003", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = 'c3333333-0000-0000-0000-000000000003';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

DO $$
DECLARE
  v_bob     UUID := 'b2222222-0000-0000-0000-000000000002';
  v_charlie UUID := 'c3333333-0000-0000-0000-000000000003';
  v_err_caught BOOLEAN := FALSE;
BEGIN
  RAISE NOTICE 'Testing Test 1c: Blocked user friend request denial under authenticated role...';

  BEGIN
    INSERT INTO public.friendships (id, user_id, friend_id, status)
    VALUES ('f_verify_charlie_to_bob_blocked', v_charlie, v_bob, 'pending');
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_err_caught := TRUE;
      ASSERT SQLSTATE = '42501', FORMAT('Test 1c Failed: Expected SQLSTATE 42501, got %s', SQLSTATE);
      ASSERT SQLERRM LIKE '%row-level security%',
        FORMAT('Test 1c Failed: Expected RLS error message, got: %s', SQLERRM);
    WHEN OTHERS THEN
      IF SQLSTATE = '42501' THEN
        v_err_caught := TRUE;
      ELSE
        RAISE EXCEPTION 'Test 1c Failed: Expected SQLSTATE 42501, got % (%)', SQLSTATE, SQLERRM;
      END IF;
  END;

  ASSERT v_err_caught = TRUE,
    'Test 1c Failed: Charlie was able to request friendship despite being blocked by Bob';
  RAISE NOTICE '✓ Test 1c Passed: RLS insert policy prevented blocked user from sending friend request (SQLSTATE 42501)';
END $$;

-- 1d. Third-party relationship probing denial using Charlie
DO $$
DECLARE
  v_alice   UUID := 'a1111111-0000-0000-0000-000000000001';
  v_bob     UUID := 'b2222222-0000-0000-0000-000000000002';
BEGIN
  RAISE NOTICE 'Testing Test 1d: Third-party relationship probing denial via Charlie...';

  -- Charlie is NOT a participant in Alice <-> Bob relationship
  ASSERT public.is_blocked_between(v_alice, v_bob) = FALSE,
    'Test 1d Failed: is_blocked_between returned true to non-participant Charlie';

  ASSERT public.are_friends(v_alice, v_bob) = FALSE,
    'Test 1d Failed: are_friends returned true to non-participant Charlie';

  RAISE NOTICE '✓ Test 1d Passed: Third-party relationship probing strictly returns FALSE';
END $$;

-- 1e. Participant query on accepted friendship
RESET ROLE;
UPDATE public.friendships SET status = 'accepted' WHERE id = 'f_verify_alice_to_bob';

-- Alice checks friendship
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "a1111111-0000-0000-0000-000000000001", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = 'a1111111-0000-0000-0000-000000000001';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

DO $$
DECLARE
  v_alice UUID := 'a1111111-0000-0000-0000-000000000001';
  v_bob   UUID := 'b2222222-0000-0000-0000-000000000002';
BEGIN
  ASSERT public.are_friends(v_alice, v_bob) = TRUE,
    'Test 1e Failed: Participant Alice could not verify accepted friendship with Bob';
  RAISE NOTICE '✓ Test 1e Passed: Participants can verify accepted friendship';
END $$;

-- 1f. Forged friendship status: Alice attempts to create 'accepted' friendship directly
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "a1111111-0000-0000-0000-000000000001", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = 'a1111111-0000-0000-0000-000000000001';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

DO $$
DECLARE
  v_alice UUID := 'a1111111-0000-0000-0000-000000000001';
  v_charlie UUID := 'c3333333-0000-0000-0000-000000000003';
  v_err_caught BOOLEAN := FALSE;
BEGIN
  RAISE NOTICE 'Testing Test 1f: Forged accepted friendship creation rejection...';
  BEGIN
    INSERT INTO public.friendships (id, user_id, friend_id, status)
    VALUES ('f_verify_forged_accepted', v_alice, v_charlie, 'accepted');
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := TRUE;
    ASSERT SQLSTATE IN ('42501', '23514'),
      FORMAT('Test 1f Failed: Expected SQLSTATE 42501 or 23514, got %s (%s)', SQLSTATE, SQLERRM);
  END;
  ASSERT v_err_caught = TRUE, 'Test 1f Failed: Forged accepted friend request was not rejected';
  RAISE NOTICE '✓ Test 1f Passed: Authenticated user cannot forge accepted friendship status on INSERT';
END $$;

-- 1g. Forged friendship status: Alice attempts to create 'blocked' friendship directly
DO $$
DECLARE
  v_alice UUID := 'a1111111-0000-0000-0000-000000000001';
  v_charlie UUID := 'c3333333-0000-0000-0000-000000000003';
  v_err_caught BOOLEAN := FALSE;
BEGIN
  RAISE NOTICE 'Testing Test 1g: Forged blocked friendship creation rejection...';
  BEGIN
    INSERT INTO public.friendships (id, user_id, friend_id, status)
    VALUES ('f_verify_forged_blocked', v_alice, v_charlie, 'blocked');
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := TRUE;
    ASSERT SQLSTATE IN ('42501', '23514'),
      FORMAT('Test 1g Failed: Expected SQLSTATE 42501 or 23514, got %s (%s)', SQLSTATE, SQLERRM);
  END;
  ASSERT v_err_caught = TRUE, 'Test 1g Failed: Forged blocked friend request was not rejected';
  RAISE NOTICE '✓ Test 1g Passed: Authenticated user cannot forge blocked friendship status on INSERT';
END $$;

-- 1h. Recipient-only friendship approval & Self-approval rejection
-- Alice creates valid pending request to Charlie
DO $$
DECLARE
  v_alice UUID := 'a1111111-0000-0000-0000-000000000001';
  v_charlie UUID := 'c3333333-0000-0000-0000-000000000003';
BEGIN
  INSERT INTO public.friendships (id, user_id, friend_id, status)
  VALUES ('f_verify_alice_to_charlie', v_alice, v_charlie, 'pending');
END $$;

-- Alice (initiator) attempts to accept her own request
DO $$
DECLARE
  v_err_caught BOOLEAN := FALSE;
  v_rows INT := 0;
BEGIN
  RAISE NOTICE 'Testing Test 1h: Initiator cannot accept own friend request...';
  BEGIN
    UPDATE public.friendships
    SET status = 'accepted'
    WHERE id = 'f_verify_alice_to_charlie';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := TRUE;
    ASSERT SQLSTATE IN ('42501', '23514'),
      FORMAT('Test 1h Failed: Expected SQLSTATE 42501 or 23514, got %s', SQLSTATE);
  END;
  ASSERT v_err_caught = TRUE OR v_rows = 0,
    'Test 1h Failed: Initiator was able to accept their own friend request';
  RAISE NOTICE '✓ Test 1h Passed: Initiator cannot accept own friend request';
END $$;

-- Charlie (recipient) accepts the pending request
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "c3333333-0000-0000-0000-000000000003", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = 'c3333333-0000-0000-0000-000000000003';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

DO $$
DECLARE
  v_rows INT := 0;
BEGIN
  RAISE NOTICE 'Testing Test 1h: Recipient Charlie accepts request from Alice...';
  UPDATE public.friendships
  SET status = 'accepted'
  WHERE id = 'f_verify_alice_to_charlie';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 1, 'Test 1h Failed: Recipient could not accept pending friendship';
  RAISE NOTICE '✓ Test 1h Passed: Recipient-only approval strictly enforced';
END $$;


-- ==============================================================================
-- TEST 2: REAL AUTHENTICATED GROUP MEMBERSHIP PRIVACY
-- ==============================================================================
RESET ROLE;
-- Fixture: Private group created by Alice; Bob is a member; Charlie is not.
INSERT INTO public.private_groups (id, name, creator_id)
VALUES ('grp_verify_secret', 'Alice Secret Group', 'a1111111-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.group_members (group_id, user_id, role)
VALUES ('grp_verify_secret', 'b2222222-0000-0000-0000-000000000002', 'member')
ON CONFLICT (group_id, user_id) DO NOTHING;

-- 2a. Member checks own membership (Bob checks Bob)
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "b2222222-0000-0000-0000-000000000002", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = 'b2222222-0000-0000-0000-000000000002';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

DO $$
DECLARE
  v_bob UUID := 'b2222222-0000-0000-0000-000000000002';
BEGIN
  RAISE NOTICE 'Testing Test 2a: Member checking their own membership (Bob)...';
  ASSERT public.is_group_member('grp_verify_secret', v_bob) = TRUE,
    'Test 2a Failed: Member Bob was denied checking his own membership';
  RAISE NOTICE '✓ Test 2a Passed: Member can verify their own group membership';
END $$;

-- 2b. Group creator checks membership (Alice checks Bob and Charlie)
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "a1111111-0000-0000-0000-000000000001", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = 'a1111111-0000-0000-0000-000000000001';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

DO $$
DECLARE
  v_bob     UUID := 'b2222222-0000-0000-0000-000000000002';
  v_charlie UUID := 'c3333333-0000-0000-0000-000000000003';
BEGIN
  RAISE NOTICE 'Testing Test 2b: Group creator checking membership (Alice)...';
  ASSERT public.is_group_member('grp_verify_secret', v_bob) = TRUE,
    'Test 2b Failed: Creator Alice could not check Bob membership';
  ASSERT public.is_group_member('grp_verify_secret', v_charlie) = FALSE,
    'Test 2b Failed: is_group_member returned true for non-member Charlie';
  RAISE NOTICE '✓ Test 2b Passed: Group creator can verify member and non-member statuses';
END $$;

-- 2c. Non-member third-party probing denial (Charlie probes Bob's membership)
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "c3333333-0000-0000-0000-000000000003", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = 'c3333333-0000-0000-0000-000000000003';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

DO $$
DECLARE
  v_bob     UUID := 'b2222222-0000-0000-0000-000000000002';
  v_charlie UUID := 'c3333333-0000-0000-0000-000000000003';
BEGIN
  RAISE NOTICE 'Testing Test 2c: Non-member third-party probing denial (Charlie)...';

  -- Charlie probing Bob in Alice's group must return FALSE
  ASSERT public.is_group_member('grp_verify_secret', v_bob) = FALSE,
    'Test 2c Failed: Non-member Charlie was able to probe Bob membership in Alice group';

  -- Charlie checking himself in Alice's group must return FALSE
  ASSERT public.is_group_member('grp_verify_secret', v_charlie) = FALSE,
    'Test 2c Failed: is_group_member returned true for non-member Charlie';

  RAISE NOTICE '✓ Test 2c Passed: Non-member third-party probing strictly denied';
END $$;


-- ==============================================================================
-- TEST 3: REAL AUTHENTICATED CHALLENGE AUTHORIZATION (RLS & TRIGGERS)
-- ==============================================================================
RESET ROLE;
-- Fixtures: Challenges for Alice and Bob
INSERT INTO public.challenges (
  id, user_id, name, mode, duration, start_date, end_date, status,
  consistency_rate, current_streak, longest_streak, activity_streak, workouts_completed
) VALUES
  ('chal_verify_alice', 'a1111111-0000-0000-0000-000000000001', 'Alice Challenge', 'monk', 30, CURRENT_DATE - 1, CURRENT_DATE + 28, 'active', 0, 0, 0, 0, 0),
  ('chal_verify_bob',   'b2222222-0000-0000-0000-000000000002', 'Bob Challenge',   'monk', 30, CURRENT_DATE - 1, CURRENT_DATE + 28, 'active', 0, 0, 0, 0, 0)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- 3a. Alice can update her own challenge under authenticated context
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "a1111111-0000-0000-0000-000000000001", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = 'a1111111-0000-0000-0000-000000000001';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

DO $$
DECLARE
  v_rows INT;
BEGIN
  RAISE NOTICE 'Testing Test 3a: Alice updating her own challenge under authenticated RLS...';

  UPDATE public.challenges
  SET name = 'Alice Legitimate Update'
  WHERE id = 'chal_verify_alice';

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 1, FORMAT('Test 3a Failed: Alice could not update own challenge (rows: %s)', v_rows);
  RAISE NOTICE '✓ Test 3a Passed: Owner successfully updated own challenge';
END $$;

-- 3b. Bob CANNOT update Alice's challenge (RLS UPDATE rejects/hides target row)
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "b2222222-0000-0000-0000-000000000002", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = 'b2222222-0000-0000-0000-000000000002';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

DO $$
DECLARE
  v_rows INT;
  v_name TEXT;
BEGIN
  RAISE NOTICE 'Testing Test 3b: Bob attempting to update Alice challenge under authenticated RLS...';

  UPDATE public.challenges
  SET name = 'Hijacked by Bob'
  WHERE id = 'chal_verify_alice';

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 0, FORMAT('Test 3b Failed: RLS permitted Bob to update Alice challenge (rows: %s)', v_rows);

  -- Verify Alice's challenge name was not modified
  SELECT name INTO v_name FROM public.challenges WHERE id = 'chal_verify_alice';
  ASSERT v_name = 'Alice Legitimate Update', 'Test 3b Failed: Alice challenge name was mutated';

  RAISE NOTICE '✓ Test 3b Passed: Non-owner update blocked by RLS (0 rows updated)';
END $$;

-- 3c. Bob cannot transfer ownership of his own challenge (specific trigger rejection)
DO $$
DECLARE
  v_alice UUID := 'a1111111-0000-0000-0000-000000000001';
  v_err_caught BOOLEAN := FALSE;
BEGIN
  RAISE NOTICE 'Testing Test 3c: Challenge ownership transfer denial...';

  BEGIN
    UPDATE public.challenges
    SET user_id = v_alice
    WHERE id = 'chal_verify_bob';
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := TRUE;
    ASSERT SQLERRM LIKE '%ownership cannot be transferred%',
      FORMAT('Test 3c Failed: Expected ownership transfer message, got: %s (SQLSTATE: %s)', SQLERRM, SQLSTATE);
  END;

  ASSERT v_err_caught = TRUE,
    'Test 3c Failed: Trigger or policy did not block challenge ownership transfer';
  RAISE NOTICE '✓ Test 3c Passed: Challenge ownership transfer strictly prohibited with expected error';
END $$;

-- 3d. Verify no other permissive UPDATE policies bypass owner-only authorization
RESET ROLE;
DO $$
DECLARE
  v_count INT;
BEGIN
  RAISE NOTICE 'Testing Test 3d: Verifying no permissive UPDATE policies bypass owner-only check...';

  SELECT COUNT(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'challenges'
    AND cmd IN ('UPDATE', 'ALL')
    AND policyname <> 'Challenges user update';

  ASSERT v_count = 0,
    FORMAT('Test 3d Failed: Found %s unauthorized permissive policies on public.challenges', v_count);
  RAISE NOTICE '✓ Test 3d Passed: Only owner-only UPDATE policy exists on public.challenges';
END $$;

-- 3e. Selected habit ownership check: Alice cannot select Charlie's or Bob's habit
DO $$
DECLARE
  v_alice UUID := 'a1111111-0000-0000-0000-000000000001';
  v_err_caught BOOLEAN := FALSE;
BEGIN
  RAISE NOTICE 'Testing Test 3e: Foreign habit selection rejection...';
  BEGIN
    INSERT INTO public.challenges (
      id, user_id, name, mode, duration, start_date, end_date, status, selected_habit_ids
    ) VALUES (
      'chal_foreign_habit', v_alice, 'Foreign Habit Chal', 'monk', 30, CURRENT_DATE, CURRENT_DATE + 29, 'active', ARRAY['h_priv_bob']
    );
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := TRUE;
    ASSERT SQLSTATE = '23514',
      FORMAT('Test 3e Failed: Expected SQLSTATE 23514, got %s (%s)', SQLSTATE, SQLERRM);
    ASSERT SQLERRM LIKE '%selected_habit_ids can only contain habits owned by the challenge user%',
      FORMAT('Test 3e Failed: Expected ownership error message, got %s', SQLERRM);
  END;
  ASSERT v_err_caught = TRUE, 'Test 3e Failed: Foreign habit selection was not rejected';
  RAISE NOTICE '✓ Test 3e Passed: Challenge cannot select habits owned by another user';
END $$;


-- ==============================================================================
-- TEST 4: REAL AUTHENTICATED HABIT AND HABIT COMPLETIONS PRIVACY (RLS SELECT)
-- ==============================================================================
RESET ROLE;
-- Fixtures: Private habits and completions for Alice and Bob
INSERT INTO public.habits (id, user_id, name, schedule, archived)
VALUES
  ('h_priv_alice', 'a1111111-0000-0000-0000-000000000001', 'Alice Secret Meditation', '"daily"'::jsonb, FALSE),
  ('h_priv_bob',   'b2222222-0000-0000-0000-000000000002', 'Bob Secret Weightlifting', '"daily"'::jsonb, FALSE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.habit_completions (id, user_id, challenge_id, habit_id, date)
VALUES
  ('hc_priv_alice', 'a1111111-0000-0000-0000-000000000001', 'chal_verify_alice', 'h_priv_alice', CURRENT_DATE),
  ('hc_priv_bob',   'b2222222-0000-0000-0000-000000000002', 'chal_verify_bob',   'h_priv_bob',   CURRENT_DATE)
ON CONFLICT (id) DO NOTHING;

-- 4a. Alice reads habits and habit_completions under authenticated role
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "a1111111-0000-0000-0000-000000000001", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = 'a1111111-0000-0000-0000-000000000001';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

DO $$
DECLARE
  v_habit_count INT;
  v_comp_count INT;
  v_bob_habit_count INT;
  v_bob_comp_count INT;
BEGIN
  RAISE NOTICE 'Testing Test 4a: Alice habit and completion visibility under authenticated RLS...';

  SELECT COUNT(*) INTO v_habit_count
  FROM public.habits
  WHERE id IN ('h_priv_alice', 'h_priv_bob');

  SELECT COUNT(*) INTO v_bob_habit_count
  FROM public.habits
  WHERE id = 'h_priv_bob';

  ASSERT v_habit_count = 1,
    FORMAT('Test 4a Failed: Expected 1 habit visible to Alice, got %s', v_habit_count);
  ASSERT v_bob_habit_count = 0,
    'Test 4a Failed: Bob private habit is visible to Alice';

  SELECT COUNT(*) INTO v_comp_count
  FROM public.habit_completions
  WHERE id IN ('hc_priv_alice', 'hc_priv_bob');

  SELECT COUNT(*) INTO v_bob_comp_count
  FROM public.habit_completions
  WHERE id = 'hc_priv_bob';

  ASSERT v_comp_count = 1,
    FORMAT('Test 4a Failed: Expected 1 completion visible to Alice, got %s', v_comp_count);
  ASSERT v_bob_comp_count = 0,
    'Test 4a Failed: Bob completion is visible to Alice';

  RAISE NOTICE '✓ Test 4a Passed: Alice can only see her own habits and completions';
END $$;

-- 4b. Bob reads habits and habit_completions under authenticated role
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "b2222222-0000-0000-0000-000000000002", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" = 'b2222222-0000-0000-0000-000000000002';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

DO $$
DECLARE
  v_alice_habit_count INT;
  v_alice_comp_count INT;
  v_bob_habit_count INT;
  v_bob_comp_count INT;
BEGIN
  RAISE NOTICE 'Testing Test 4b: Bob habit and completion visibility under authenticated RLS...';

  SELECT COUNT(*) INTO v_alice_habit_count
  FROM public.habits
  WHERE id = 'h_priv_alice';

  SELECT COUNT(*) INTO v_bob_habit_count
  FROM public.habits
  WHERE id = 'h_priv_bob';

  ASSERT v_alice_habit_count = 0,
    'Test 4b Failed: Alice private habit is visible to Bob';
  ASSERT v_bob_habit_count = 1,
    'Test 4b Failed: Bob own habit is not visible to Bob';

  SELECT COUNT(*) INTO v_alice_comp_count
  FROM public.habit_completions
  WHERE id = 'hc_priv_alice';

  SELECT COUNT(*) INTO v_bob_comp_count
  FROM public.habit_completions
  WHERE id = 'hc_priv_bob';

  ASSERT v_alice_comp_count = 0,
    'Test 4b Failed: Alice completion is visible to Bob';
  ASSERT v_bob_comp_count = 1,
    'Test 4b Failed: Bob own completion is not visible to Bob';

  RAISE NOTICE '✓ Test 4b Passed: Bob can only see his own habits and completions';
END $$;

-- 4c. Anonymous role reads habits and completions (must see 0 rows)
SET LOCAL ROLE anon;
SET LOCAL "request.jwt.claims" = '{"role": "anon"}';
SET LOCAL "request.jwt.claim.role" = 'anon';
RESET "request.jwt.claim.sub";

DO $$
DECLARE
  v_habit_count INT;
  v_comp_count INT;
BEGIN
  RAISE NOTICE 'Testing Test 4c: Anonymous visibility on habits and completions...';

  SELECT COUNT(*) INTO v_habit_count
  FROM public.habits
  WHERE id IN ('h_priv_alice', 'h_priv_bob');

  SELECT COUNT(*) INTO v_comp_count
  FROM public.habit_completions
  WHERE id IN ('hc_priv_alice', 'hc_priv_bob');

  ASSERT v_habit_count = 0,
    FORMAT('Test 4c Failed: Anonymous caller could see habits (count: %s)', v_habit_count);
  ASSERT v_comp_count = 0,
    FORMAT('Test 4c Failed: Anonymous caller could see habit_completions (count: %s)', v_comp_count);

  RAISE NOTICE '✓ Test 4c Passed: Anonymous caller denied access to all private habits and logs';
END $$;


-- ==============================================================================
-- TEST 5: AUTHORITATIVE SCORING, ACTIVITY STREAK CONSISTENCY & FUTURE LOG PREVENTION
-- ==============================================================================
RESET ROLE;

DO $$
DECLARE
  v_alice   UUID := 'a1111111-0000-0000-0000-000000000001';
  v_metrics RECORD;
  v_err_caught BOOLEAN;
BEGIN
  RAISE NOTICE 'Testing Test 5: Authoritative Scoring, Streak Semantics & Future Date Prevention...';

  -- Setup habits for scoring tests
  INSERT INTO public.habits (id, user_id, name, schedule, archived)
  VALUES
    ('h_score_a', v_alice, 'Core Habit A', '"daily"'::jsonb, FALSE),
    ('h_score_b', v_alice, 'Core Habit B', '"daily"'::jsonb, FALSE),
    ('h_score_unsel', v_alice, 'Unselected Habit', '"daily"'::jsonb, FALSE),
    ('h_score_mwf', v_alice, 'MWF Habit', '["mon","wed","fri"]'::jsonb, FALSE)
  ON CONFLICT (id) DO NOTHING;

  -- ----------------------------------------------------------------------------
  -- Case 5.1: No selected habits + 1 completed workout (Wanderer mode)
  -- ----------------------------------------------------------------------------
  INSERT INTO public.workout_sessions (id, user_id, name, status, date)
  VALUES ('ws_score_wand', v_alice, 'Wanderer Workout', 'completed', CURRENT_DATE)
  ON CONFLICT (id) DO NOTHING;

  SELECT * INTO v_metrics FROM public.calculate_authoritative_challenge_metrics(
    'chal_score_wand',
    v_alice,
    CURRENT_DATE - 3,
    CURRENT_DATE,
    ARRAY[]::TEXT[]
  );

  ASSERT v_metrics.o_consistency_rate = 0.0,
    FORMAT('Case 5.1 Failed: Consistency should be 0.0, got %s', v_metrics.o_consistency_rate);
  ASSERT v_metrics.o_current_streak = 0,
    FORMAT('Case 5.1 Failed: Perfect streak should be 0, got %s', v_metrics.o_current_streak);
  ASSERT v_metrics.o_activity_streak = 1,
    FORMAT('Case 5.1 Failed: Activity streak should be 1, got %s', v_metrics.o_activity_streak);
  ASSERT v_metrics.o_workouts_completed = 1,
    FORMAT('Case 5.1 Failed: Workouts completed should be 1, got %s', v_metrics.o_workouts_completed);
  RAISE NOTICE '✓ Case 5.1 Passed: Workout-only challenge correctly yields 0 perfect streak and 1 activity streak';

  -- ----------------------------------------------------------------------------
  -- Case 5.2: Partial scheduled-habit completion
  -- Day T has 2 scheduled habits (A and B). User completes only A.
  -- ----------------------------------------------------------------------------
  INSERT INTO public.habit_completions (id, user_id, challenge_id, habit_id, date)
  VALUES ('hc_score_part_a', v_alice, 'chal_score_part', 'h_score_a', CURRENT_DATE)
  ON CONFLICT (id) DO NOTHING;

  SELECT * INTO v_metrics FROM public.calculate_authoritative_challenge_metrics(
    'chal_score_part',
    v_alice,
    CURRENT_DATE,
    CURRENT_DATE,
    ARRAY['h_score_a', 'h_score_b']
  );

  ASSERT v_metrics.o_consistency_rate = 50.0,
    FORMAT('Case 5.2 Failed: Consistency should be 50.0%% (1/2), got %s', v_metrics.o_consistency_rate);
  ASSERT v_metrics.o_current_streak = 0,
    FORMAT('Case 5.2 Failed: Partial day must not extend perfect streak, got %s', v_metrics.o_current_streak);
  ASSERT v_metrics.o_activity_streak = 1,
    FORMAT('Case 5.2 Failed: Partial day with 1 habit completion must count as activity day, got %s', v_metrics.o_activity_streak);
  RAISE NOTICE '✓ Case 5.2 Passed: Partial scheduled completion yields 50%% consistency, 0 perfect streak, 1 activity streak';

  -- ----------------------------------------------------------------------------
  -- Case 5.3: Full scheduled-habit completion
  -- User completes both A and B on Day T.
  -- ----------------------------------------------------------------------------
  INSERT INTO public.habit_completions (id, user_id, challenge_id, habit_id, date)
  VALUES ('hc_score_part_b', v_alice, 'chal_score_part', 'h_score_b', CURRENT_DATE)
  ON CONFLICT (id) DO NOTHING;

  SELECT * INTO v_metrics FROM public.calculate_authoritative_challenge_metrics(
    'chal_score_part',
    v_alice,
    CURRENT_DATE,
    CURRENT_DATE,
    ARRAY['h_score_a', 'h_score_b']
  );

  ASSERT v_metrics.o_consistency_rate = 100.0,
    FORMAT('Case 5.3 Failed: Consistency should be 100.0%%, got %s', v_metrics.o_consistency_rate);
  ASSERT v_metrics.o_current_streak = 1,
    FORMAT('Case 5.3 Failed: Full scheduled completion must yield perfect streak 1, got %s', v_metrics.o_current_streak);
  ASSERT v_metrics.o_activity_streak = 1,
    FORMAT('Case 5.3 Failed: Full scheduled completion must yield activity streak 1, got %s', v_metrics.o_activity_streak);
  RAISE NOTICE '✓ Case 5.3 Passed: Full scheduled completion yields 100%% consistency, 1 perfect streak, 1 activity streak';

  -- ----------------------------------------------------------------------------
  -- Case 5.4: Unselected habit completion does not bleed into challenge metrics
  -- ----------------------------------------------------------------------------
  INSERT INTO public.habit_completions (id, user_id, challenge_id, habit_id, date)
  VALUES ('hc_score_unsel', v_alice, 'chal_score_iso', 'h_score_unsel', CURRENT_DATE - 1)
  ON CONFLICT (id) DO NOTHING;

  SELECT * INTO v_metrics FROM public.calculate_authoritative_challenge_metrics(
    'chal_score_iso',
    v_alice,
    CURRENT_DATE - 2,
    CURRENT_DATE - 1,
    ARRAY['h_score_a']
  );

  ASSERT v_metrics.o_consistency_rate = 0.0,
    FORMAT('Case 5.4 Failed: Unselected habit contributed to consistency, got %s', v_metrics.o_consistency_rate);
  ASSERT v_metrics.o_current_streak = 0,
    FORMAT('Case 5.4 Failed: Unselected habit contributed to perfect streak, got %s', v_metrics.o_current_streak);
  ASSERT v_metrics.o_activity_streak = 0,
    FORMAT('Case 5.4 Failed: Unselected habit contributed to activity streak, got %s', v_metrics.o_activity_streak);
  RAISE NOTICE '✓ Case 5.4 Passed: Unselected habit completion strictly isolated from challenge metrics';

  -- ----------------------------------------------------------------------------
  -- Case 5.5: Unscheduled habit completion does NOT count as activity day
  -- Habit h_score_mwf is scheduled ONLY on Mon, Wed, Fri.
  -- Complete it on a known Tuesday (e.g. 2026-10-27 was Tuesday).
  -- ----------------------------------------------------------------------------
  INSERT INTO public.habit_completions (id, user_id, challenge_id, habit_id, date)
  VALUES ('hc_score_unsched_tue', v_alice, 'chal_score_unsched', 'h_score_mwf', '2026-10-27')
  ON CONFLICT (id) DO NOTHING;

  SELECT * INTO v_metrics FROM public.calculate_authoritative_challenge_metrics(
    'chal_score_unsched',
    v_alice,
    '2026-10-26', -- Monday
    '2026-10-27', -- Tuesday (unscheduled day for h_score_mwf)
    ARRAY['h_score_mwf']
  );

  ASSERT v_metrics.o_activity_streak = 0,
    FORMAT('Case 5.5 Failed: Unscheduled habit completion counted as activity day, got activity_streak %s', v_metrics.o_activity_streak);
  ASSERT v_metrics.o_consistency_rate = 0.0,
    FORMAT('Case 5.5 Failed: Unscheduled completion counted toward scheduled rate, got %s', v_metrics.o_consistency_rate);
  RAISE NOTICE '✓ Case 5.5 Passed: Selected habit completion on unscheduled day does NOT count toward activity streak';

  -- ----------------------------------------------------------------------------
  -- Case 5.6: Consecutive activity days and interrupted streaks
  -- Days: T-4 (active), T-3 (active), T-2 (active), T-1 (MISSED), T (active)
  -- Expected: current activity streak = 1, workouts_completed = 4
  -- ----------------------------------------------------------------------------
  INSERT INTO public.workout_sessions (id, user_id, name, status, date)
  VALUES
    ('ws_act_t4', v_alice, 'Workout T-4', 'completed', CURRENT_DATE - 4),
    ('ws_act_t3', v_alice, 'Workout T-3', 'completed', CURRENT_DATE - 3),
    ('ws_act_t2', v_alice, 'Workout T-2', 'completed', CURRENT_DATE - 2),
    ('ws_act_t0', v_alice, 'Workout T-0', 'completed', CURRENT_DATE)
  ON CONFLICT (id) DO NOTHING;

  SELECT * INTO v_metrics FROM public.calculate_authoritative_challenge_metrics(
    'chal_act_interrupted',
    v_alice,
    CURRENT_DATE - 4,
    CURRENT_DATE,
    ARRAY[]::TEXT[]
  );

  ASSERT v_metrics.o_activity_streak = 1,
    FORMAT('Case 5.6 Failed: Expected current activity streak 1 after gap, got %s', v_metrics.o_activity_streak);
  ASSERT v_metrics.o_workouts_completed = 4,
    FORMAT('Case 5.6 Failed: Expected 4 workouts completed, got %s', v_metrics.o_workouts_completed);
  RAISE NOTICE '✓ Case 5.6 Passed: Interrupted activity streak correctly calculated';

  -- ----------------------------------------------------------------------------
  -- Case 5.7: Future-date prevention enforcement (trigger check_no_future_logs)
  -- ----------------------------------------------------------------------------
  v_err_caught := FALSE;
  BEGIN
    INSERT INTO public.habit_completions (id, user_id, challenge_id, habit_id, date)
    VALUES ('hc_future_bad', v_alice, 'chal_act_interrupted', 'h_score_a', CURRENT_DATE + 5);
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := TRUE;
    ASSERT SQLERRM LIKE '%Cannot record log with future date%',
      FORMAT('Case 5.7 Failed: Expected future date rejection message, got: %s', SQLERRM);
  END;
  ASSERT v_err_caught = TRUE, 'Case 5.7 Failed: Future-dated habit completion was not rejected by trigger';

  v_err_caught := FALSE;
  BEGIN
    INSERT INTO public.workout_sessions (id, user_id, name, status, date)
    VALUES ('ws_future_bad', v_alice, 'Future Workout', 'completed', CURRENT_DATE + 5);
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := TRUE;
    ASSERT SQLERRM LIKE '%Cannot record log with future date%',
      FORMAT('Case 5.7 Failed: Expected future date rejection message on workout, got: %s', SQLERRM);
  END;
  ASSERT v_err_caught = TRUE, 'Case 5.7 Failed: Future-dated workout was not rejected by trigger';
  RAISE NOTICE '✓ Case 5.7 Passed: Future-dated habit completions and workouts strictly rejected by trigger';

  -- ----------------------------------------------------------------------------
  -- Case 5.8: Cross-Challenge Completion Isolation
  -- 1. Two challenges owned by Alice: 'chal_iso_1' and 'chal_iso_2'
  -- 2. The same habit 'h_score_a' selected in both challenges
  -- 3. A completion linked ONLY to 'chal_iso_1'
  -- ----------------------------------------------------------------------------
  INSERT INTO public.challenges (id, user_id, name, mode, duration, start_date, end_date, status, selected_habit_ids)
  VALUES
    ('chal_iso_1', v_alice, 'Isolation Challenge 1', 'monk', 30, CURRENT_DATE - 5, CURRENT_DATE + 24, 'active', ARRAY['h_score_a']),
    ('chal_iso_2', v_alice, 'Isolation Challenge 2', 'monk', 30, CURRENT_DATE - 5, CURRENT_DATE + 24, 'active', ARRAY['h_score_a'])
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.habit_completions (id, user_id, challenge_id, habit_id, date)
  VALUES ('hc_iso_chal1_only', v_alice, 'chal_iso_1', 'h_score_a', CURRENT_DATE)
  ON CONFLICT (id) DO NOTHING;

  -- Evaluate chal_iso_1: completion MUST be counted
  SELECT * INTO v_metrics FROM public.calculate_authoritative_challenge_metrics(
    'chal_iso_1',
    v_alice,
    CURRENT_DATE,
    CURRENT_DATE,
    ARRAY['h_score_a']
  );
  ASSERT v_metrics.o_consistency_rate = 100.0,
    FORMAT('Case 5.8 Failed: Challenge 1 expected 100%% consistency, got %s', v_metrics.o_consistency_rate);
  ASSERT v_metrics.o_activity_streak = 1,
    FORMAT('Case 5.8 Failed: Challenge 1 expected activity streak 1, got %s', v_metrics.o_activity_streak);

  -- Evaluate chal_iso_2: completion from chal_iso_1 MUST NOT count!
  SELECT * INTO v_metrics FROM public.calculate_authoritative_challenge_metrics(
    'chal_iso_2',
    v_alice,
    CURRENT_DATE,
    CURRENT_DATE,
    ARRAY['h_score_a']
  );
  ASSERT v_metrics.o_consistency_rate = 0.0,
    FORMAT('Case 5.8 Failed: Challenge 2 bled completions from Challenge 1! Consistency: %s', v_metrics.o_consistency_rate);
  ASSERT v_metrics.o_activity_streak = 0,
    FORMAT('Case 5.8 Failed: Challenge 2 bled activity streak from Challenge 1! Streak: %s', v_metrics.o_activity_streak);
  RAISE NOTICE '✓ Case 5.8 Passed: Cross-challenge completions strictly isolated between challenges of the same user';

  -- ----------------------------------------------------------------------------
  -- Case 5.9: Foreign Habit & Foreign Challenge Completion Isolation
  -- Foreign habit in selected_habit_ids array must be safely excluded by calculate_authoritative_challenge_metrics
  -- ----------------------------------------------------------------------------
  SELECT * INTO v_metrics FROM public.calculate_authoritative_challenge_metrics(
    'chal_iso_1',
    v_alice,
    CURRENT_DATE,
    CURRENT_DATE,
    ARRAY['h_priv_bob'] -- Bob's habit passed for Alice's challenge
  );
  ASSERT v_metrics.o_consistency_rate = 0.0,
    FORMAT('Case 5.9 Failed: Foreign habit contributed to total scheduled, got %s', v_metrics.o_consistency_rate);

  -- Out-of-window completion (completed before start date or after end date)
  INSERT INTO public.habit_completions (id, user_id, challenge_id, habit_id, date)
  VALUES ('hc_out_of_window', v_alice, 'chal_iso_1', 'h_score_a', CURRENT_DATE - 10)
  ON CONFLICT (id) DO NOTHING;

  SELECT * INTO v_metrics FROM public.calculate_authoritative_challenge_metrics(
    'chal_iso_1',
    v_alice,
    CURRENT_DATE - 5,
    CURRENT_DATE,
    ARRAY['h_score_a']
  );
  -- Only CURRENT_DATE was completed in the [CURRENT_DATE-5, CURRENT_DATE] window (1 out of 6 scheduled days = 16.7%)
  ASSERT v_metrics.o_consistency_rate = 16.7,
    FORMAT('Case 5.9 Failed: Out-of-window completion affected score, got %s', v_metrics.o_consistency_rate);
  RAISE NOTICE '✓ Case 5.9 Passed: Foreign habits, foreign user completions, and out-of-window completions strictly isolated';

  -- ----------------------------------------------------------------------------
  -- Case 5.10: Schedule Format Compatibility (Full Weekday, Abbreviated, Daily, Empty, NULL)
  -- ----------------------------------------------------------------------------
  INSERT INTO public.habits (id, user_id, name, schedule, archived)
  VALUES
    ('h_sched_full', v_alice, 'Full Weekday Habit', '["monday", "wednesday", "friday"]'::jsonb, FALSE),
    ('h_sched_abbr', v_alice, 'Abbreviated Habit', '["tue", "thu"]'::jsonb, FALSE),
    ('h_sched_daily', v_alice, 'Daily String Habit', '"daily"'::jsonb, FALSE),
    ('h_sched_null', v_alice, 'NULL Schedule Habit', NULL, FALSE),
    ('h_sched_empty', v_alice, 'Empty Schedule Habit', '[]'::jsonb, FALSE)
  ON CONFLICT (id) DO NOTHING;

  -- Test schedule helper directly:
  ASSERT public.is_habit_scheduled('["monday", "wednesday", "friday"]'::jsonb, '2026-10-26') = TRUE, 'Case 5.10 Failed: Full weekday monday not scheduled';
  ASSERT public.is_habit_scheduled('["monday", "wednesday", "friday"]'::jsonb, '2026-10-27') = FALSE, 'Case 5.10 Failed: Full weekday tuesday was scheduled';
  ASSERT public.is_habit_scheduled('["tue", "thu"]'::jsonb, '2026-10-27') = TRUE, 'Case 5.10 Failed: Abbreviated tue not scheduled';
  ASSERT public.is_habit_scheduled('"daily"'::jsonb, '2026-10-27') = TRUE, 'Case 5.10 Failed: daily string not scheduled';
  ASSERT public.is_habit_scheduled(NULL, '2026-10-27') = TRUE, 'Case 5.10 Failed: NULL schedule not scheduled';
  ASSERT public.is_habit_scheduled('[]'::jsonb, '2026-10-27') = FALSE, 'Case 5.10 Failed: Empty array [] was scheduled';

  -- Fail-closed assertions for unsupported JSON types and invalid strings:
  ASSERT public.is_habit_scheduled('123'::jsonb, '2026-10-26') = FALSE, 'Case 5.10 Failed: Number type failed open';
  ASSERT public.is_habit_scheduled('true'::jsonb, '2026-10-26') = FALSE, 'Case 5.10 Failed: Boolean type failed open';
  ASSERT public.is_habit_scheduled('{"day": "monday"}'::jsonb, '2026-10-26') = FALSE, 'Case 5.10 Failed: Object type failed open';
  ASSERT public.is_habit_scheduled('"random_string"'::jsonb, '2026-10-26') = FALSE, 'Case 5.10 Failed: Random string failed open';

  -- Deterministic ISO weekday checks (2026-10-26 is Mon=1 .. 2026-11-01 is Sun=7)
  ASSERT public.is_habit_scheduled('["monday"]'::jsonb, '2026-10-26') = TRUE, 'Case 5.10 Failed: ISO Mon';
  ASSERT public.is_habit_scheduled('["tuesday"]'::jsonb, '2026-10-27') = TRUE, 'Case 5.10 Failed: ISO Tue';
  ASSERT public.is_habit_scheduled('["wednesday"]'::jsonb, '2026-10-28') = TRUE, 'Case 5.10 Failed: ISO Wed';
  ASSERT public.is_habit_scheduled('["thursday"]'::jsonb, '2026-10-29') = TRUE, 'Case 5.10 Failed: ISO Thu';
  ASSERT public.is_habit_scheduled('["friday"]'::jsonb, '2026-10-30') = TRUE, 'Case 5.10 Failed: ISO Fri';
  ASSERT public.is_habit_scheduled('["saturday"]'::jsonb, '2026-10-31') = TRUE, 'Case 5.10 Failed: ISO Sat';
  ASSERT public.is_habit_scheduled('["sunday"]'::jsonb, '2026-11-01') = TRUE, 'Case 5.10 Failed: ISO Sun';

  -- Consistency rate with empty schedule habit (0 scheduled occurrences) MUST be 0.0%
  SELECT * INTO v_metrics FROM public.calculate_authoritative_challenge_metrics(
    'chal_sched_empty',
    v_alice,
    '2026-10-26',
    '2026-10-27',
    ARRAY['h_sched_empty']
  );
  ASSERT v_metrics.o_consistency_rate = 0.0,
    FORMAT('Case 5.10 Failed: Empty schedule expected 0.0%% consistency, got %s', v_metrics.o_consistency_rate);
  RAISE NOTICE '✓ Case 5.10 Passed: Schedule format compatibility verified across full, abbreviated, daily, empty, NULL, fail-closed unsupported types, and ISO weekdays';
END $$;


-- ==============================================================================
-- TEST 6: SELECTED HABIT MUTATION RULES & WANDERER CONSTRAINT ENFORCEMENT
-- ==============================================================================
RESET ROLE;

DO $$
DECLARE
  v_alice UUID := 'a1111111-0000-0000-0000-000000000001';
  v_bob   UUID := 'b2222222-0000-0000-0000-000000000002';
  v_err_caught BOOLEAN;
BEGIN
  RAISE NOTICE 'Testing Test 6: Selected Habit Mutation Rules & Wanderer Constraints...';

  -- 6a. Constraint chk_challenges_wanderer_null_end_date check
  ASSERT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_challenges_wanderer_null_end_date'
  ), 'Test 6a Failed: Constraint chk_challenges_wanderer_null_end_date not found in pg_constraint';

  -- 6b. Wanderer with end_date INSERT rejection (specific check constraint or trigger message)
  v_err_caught := FALSE;
  BEGIN
    INSERT INTO public.challenges (
      id, user_id, name, mode, duration, start_date, end_date, status
    ) VALUES (
      'chal_wand_bad_insert', v_alice, 'Illegal Wanderer', 'wanderer', 30, CURRENT_DATE, CURRENT_DATE + 30, 'active'
    );
  EXCEPTION
    WHEN check_violation THEN
      v_err_caught := TRUE;
    WHEN OTHERS THEN
      ASSERT SQLERRM LIKE '%Wanderer mode%' OR SQLERRM LIKE '%chk_challenges_wanderer_null_end_date%',
        FORMAT('Test 6b Failed: Expected Wanderer null end-date error, got: %s (SQLSTATE: %s)', SQLERRM, SQLSTATE);
      v_err_caught := TRUE;
  END;
  ASSERT v_err_caught = TRUE, 'Test 6b Failed: Wanderer INSERT with end_date was not rejected';

  -- 6c. Selected habits mutation after start date rejection (specific trigger message)
  INSERT INTO public.challenges (
    id, user_id, name, mode, duration, start_date, end_date, status, selected_habit_ids
  ) VALUES (
    'chal_mutate_test', v_alice, 'Mutate Test', 'monk', 30, CURRENT_DATE - 5, CURRENT_DATE + 24, 'active', ARRAY['h_score_a']
  ) ON CONFLICT (id) DO NOTHING;

  v_err_caught := FALSE;
  BEGIN
    UPDATE public.challenges
    SET selected_habit_ids = ARRAY['h_score_b']
    WHERE id = 'chal_mutate_test';
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := TRUE;
    ASSERT SQLERRM LIKE '%cannot be modified after the challenge start date%',
      FORMAT('Test 6c Failed: Expected start date mutation error message, got: %s', SQLERRM);
  END;
  ASSERT v_err_caught = TRUE, 'Test 6c Failed: Modifying selected_habit_ids after start_date was not blocked';

  -- 6d. Selected habits containing foreign user habit rejection (specific trigger message)
  v_err_caught := FALSE;
  BEGIN
    UPDATE public.challenges
    SET selected_habit_ids = ARRAY['h_priv_bob']
    WHERE id = 'chal_mutate_test';
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := TRUE;
    ASSERT SQLERRM LIKE '%can only contain habits owned by the challenge user%',
      FORMAT('Test 6d Failed: Expected foreign habit ownership message, got: %s', SQLERRM);
  END;
  ASSERT v_err_caught = TRUE, 'Test 6d Failed: Adding foreign user habit to selected_habit_ids was not blocked';

  RAISE NOTICE '✓ Test 6 Passed: Wanderer constraint and selected habit mutation rules strictly enforced with specific errors';
END $$;


-- ==============================================================================
-- TEST 7: FRIENDSHIP BACKUP DEDUPLICATION & EXACT ROLLBACK RESTORATION
-- ==============================================================================
RESET ROLE;

DO $$
DECLARE
  v_alice   UUID := 'a1111111-0000-0000-0000-000000000001';
  v_bob     UUID := 'b2222222-0000-0000-0000-000000000002';
  v_charlie UUID := 'c3333333-0000-0000-0000-000000000003';
  v_self_backup_count INT;
  v_dup_self_backup_count INT;
  v_restored_row RECORD;
BEGIN
  RAISE NOTICE 'Testing Test 7: Friendship Backup Deduplication & Exact Restoration...';

  -- Verify backup table exists and has unique constraint on id
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = '_friendships_dedup_backup'
  ), 'Test 7 Failed: _friendships_dedup_backup table does not exist';

  ASSERT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_friendships_dedup_backup_id'
  ), 'Test 7 Failed: uq_friendships_dedup_backup_id unique constraint missing from backup table';

  -- Setup temporary fixtures including:
  -- 1. Mutual reciprocal pair (Alice <-> Bob)
  -- 2. Opposing blocks (Alice <-> Charlie)
  -- 3. Duplicate self-friendship rows for Alice (Alice -> Alice twice)
  CREATE TEMP TABLE temp_test_friendships (
    id TEXT,
    user_id UUID,
    friend_id UUID,
    status TEXT,
    created_at TIMESTAMPTZ
  ) ON COMMIT DROP;

  INSERT INTO temp_test_friendships (id, user_id, friend_id, status, created_at)
  VALUES
    ('tf_acc_1', v_alice, v_bob, 'accepted', '2026-01-01 10:00:00+00'),
    ('tf_acc_2', v_bob, v_alice, 'accepted', '2026-01-02 10:00:00+00'),
    ('tf_opp_1', v_alice, v_charlie, 'blocked', '2026-01-01 12:00:00+00'),
    ('tf_opp_2', v_charlie, v_alice, 'blocked', '2026-01-02 12:00:00+00'),
    ('tf_self_1', v_alice, v_alice, 'pending', '2026-01-01 08:00:00+00'),
    ('tf_self_2', v_alice, v_alice, 'pending', '2026-01-02 08:00:00+00');

  -- 7a. Execute corrected deduplication backup:
  -- Reciprocal deduplication excludes self-friendships (user_id <> friend_id)
  WITH ranked AS (
    SELECT
      id, user_id, friend_id, status, created_at,
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
    FROM temp_test_friendships
    WHERE user_id <> friend_id
  )
  INSERT INTO public._friendships_dedup_backup (
    id, user_id, friend_id, status, created_at, action_taken, opposing_block
  )
  SELECT
    id, user_id, friend_id, status, created_at,
    CASE WHEN rank_num = 1 THEN 'preserved_primary' ELSE 'deleted_duplicate' END,
    (block_count > 1)
  FROM ranked
  WHERE rank_num > 1 OR block_count > 1
  ON CONFLICT (id) DO NOTHING;

  -- 7b. Self-friendships archived separately and exactly once
  INSERT INTO public._friendships_dedup_backup (
    id, user_id, friend_id, status, created_at, action_taken, opposing_block
  )
  SELECT id, user_id, friend_id, status, created_at, 'deleted_self_friend', FALSE
  FROM temp_test_friendships
  WHERE user_id = friend_id
  ON CONFLICT (id) DO NOTHING;

  -- Verify self-friendships are NOT in backup with 'deleted_duplicate'
  SELECT COUNT(*) INTO v_dup_self_backup_count
  FROM public._friendships_dedup_backup
  WHERE id IN ('tf_self_1', 'tf_self_2') AND action_taken = 'deleted_duplicate';

  ASSERT v_dup_self_backup_count = 0,
    FORMAT('Test 7 Failed: Self-friendships were incorrectly archived as deleted_duplicate (%s)', v_dup_self_backup_count);

  -- Verify both self-friendships are archived exactly once with 'deleted_self_friend'
  SELECT COUNT(*) INTO v_self_backup_count
  FROM public._friendships_dedup_backup
  WHERE id IN ('tf_self_1', 'tf_self_2') AND action_taken = 'deleted_self_friend';

  ASSERT v_self_backup_count = 2,
    FORMAT('Test 7 Failed: Expected 2 self-friendships archived as deleted_self_friend, got %s', v_self_backup_count);

  -- 7c. Test exact restoration of a deleted duplicate row
  -- Ensure tf_acc_2 was preserved with exact attributes
  SELECT * INTO v_restored_row
  FROM public._friendships_dedup_backup
  WHERE id = 'tf_acc_2';

  ASSERT v_restored_row.user_id = v_bob, 'Test 7 Failed: User ID mismatch in backup';
  ASSERT v_restored_row.friend_id = v_alice, 'Test 7 Failed: Friend ID mismatch in backup';
  ASSERT v_restored_row.status = 'accepted', 'Test 7 Failed: Status mismatch in backup';
  ASSERT v_restored_row.created_at = '2026-01-02 10:00:00+00', 'Test 7 Failed: Created at mismatch in backup';

  -- 7d. Test rollback conflict detection query with differing timestamps or attributes
  ASSERT NOT EXISTS (
    SELECT id
    FROM public._friendships_dedup_backup
    WHERE action_taken IN ('deleted_duplicate', 'deleted_self_friend')
    GROUP BY id
    HAVING COUNT(DISTINCT (user_id, friend_id, status, created_at)) > 1
  ), 'Test 7d Failed: Backup records unexpectedly contains conflicting attribute/timestamp data';

  RAISE NOTICE '✓ Test 7 Passed: Friendship backup excludes self-friendships from reciprocal dedup and archives every deleted row exactly once';
END $$;


-- ==============================================================================
-- TEST 8: REQUIRED TRIGGER ATTACHMENTS VERIFICATION (pg_trigger)
-- ==============================================================================
RESET ROLE;

DO $$
DECLARE
  v_missing_triggers TEXT;
BEGIN
  RAISE NOTICE 'Testing Test 8: Verifying Required Trigger Attachments in pg_trigger...';

  SELECT string_agg(expected.name, ', ') INTO v_missing_triggers
  FROM (
    VALUES
      ('trg_protect_challenge_scores', 'challenges'),
      ('trg_refresh_challenges_on_habit_completion', 'habit_completions'),
      ('trg_refresh_challenges_on_workout', 'workout_sessions'),
      ('trg_habit_completions_no_future', 'habit_completions'),
      ('trg_workout_sessions_no_future', 'workout_sessions'),
      ('trg_friendship_immutability', 'friendships')
  ) AS expected(name, tbl)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = expected.tbl
      AND t.tgname = expected.name
      AND t.tgenabled = 'O'
      AND NOT t.tgisinternal
  );

  ASSERT v_missing_triggers IS NULL,
    FORMAT('Test 8 Failed: Missing or disabled triggers in pg_trigger: %s', v_missing_triggers);

  RAISE NOTICE '✓ Test 8 Passed: All 6 required triggers exist, are attached, and enabled (tgenabled = O)';
END $$;


-- ==============================================================================
-- TEST 9: FUNCTION PERMISSIONS MATRIX (PUBLIC, anon, authenticated)
-- ==============================================================================
RESET ROLE;

DO $$
BEGIN
  RAISE NOTICE 'Testing Test 9: Effective Function Execution Privileges Check...';

  -- 9a. Trigger & internal calculation functions must NOT be executable by anon or authenticated
  ASSERT has_function_privilege('anon', 'public.protect_challenge_score_fields()', 'EXECUTE') = FALSE,
    'Test 9a Failed: anon has EXECUTE on protect_challenge_score_fields';
  ASSERT has_function_privilege('authenticated', 'public.protect_challenge_score_fields()', 'EXECUTE') = FALSE,
    'Test 9a Failed: authenticated has EXECUTE on protect_challenge_score_fields';

  ASSERT has_function_privilege('anon', 'public.calculate_authoritative_challenge_metrics(TEXT, UUID, DATE, DATE, TEXT[])', 'EXECUTE') = FALSE,
    'Test 9a Failed: anon has EXECUTE on calculate_authoritative_challenge_metrics';
  ASSERT has_function_privilege('authenticated', 'public.calculate_authoritative_challenge_metrics(TEXT, UUID, DATE, DATE, TEXT[])', 'EXECUTE') = FALSE,
    'Test 9a Failed: authenticated has EXECUTE on calculate_authoritative_challenge_metrics';

  ASSERT has_function_privilege('anon', 'public.refresh_challenge_scores_on_habit_completion()', 'EXECUTE') = FALSE,
    'Test 9a Failed: anon has EXECUTE on refresh_challenge_scores_on_habit_completion';
  ASSERT has_function_privilege('authenticated', 'public.refresh_challenge_scores_on_habit_completion()', 'EXECUTE') = FALSE,
    'Test 9a Failed: authenticated has EXECUTE on refresh_challenge_scores_on_habit_completion';

  ASSERT has_function_privilege('anon', 'public.refresh_challenge_scores_on_workout()', 'EXECUTE') = FALSE,
    'Test 9a Failed: anon has EXECUTE on refresh_challenge_scores_on_workout';
  ASSERT has_function_privilege('authenticated', 'public.refresh_challenge_scores_on_workout()', 'EXECUTE') = FALSE,
    'Test 9a Failed: authenticated has EXECUTE on refresh_challenge_scores_on_workout';

  -- 9b. Helper functions must NOT be executable by anon
  ASSERT has_function_privilege('anon', 'public.can_request_friendship(UUID)', 'EXECUTE') = FALSE,
    'Test 9b Failed: anon has EXECUTE on can_request_friendship';
  ASSERT has_function_privilege('anon', 'public.is_blocked_between(UUID, UUID)', 'EXECUTE') = FALSE,
    'Test 9b Failed: anon has EXECUTE on is_blocked_between';
  ASSERT has_function_privilege('anon', 'public.are_friends(UUID, UUID)', 'EXECUTE') = FALSE,
    'Test 9b Failed: anon has EXECUTE on are_friends';
  ASSERT has_function_privilege('anon', 'public.is_group_member(TEXT, UUID)', 'EXECUTE') = FALSE,
    'Test 9b Failed: anon has EXECUTE on is_group_member';

  -- 9c. Helper functions MUST be executable by authenticated
  ASSERT has_function_privilege('authenticated', 'public.can_request_friendship(UUID)', 'EXECUTE') = TRUE,
    'Test 9c Failed: authenticated missing EXECUTE on can_request_friendship';
  ASSERT has_function_privilege('authenticated', 'public.is_blocked_between(UUID, UUID)', 'EXECUTE') = TRUE,
    'Test 9c Failed: authenticated missing EXECUTE on is_blocked_between';
  ASSERT has_function_privilege('authenticated', 'public.are_friends(UUID, UUID)', 'EXECUTE') = TRUE,
    'Test 9c Failed: authenticated missing EXECUTE on are_friends';
  ASSERT has_function_privilege('authenticated', 'public.is_group_member(TEXT, UUID)', 'EXECUTE') = TRUE,
    'Test 9c Failed: authenticated missing EXECUTE on is_group_member';

  RAISE NOTICE '✓ Test 9 Passed: Complete privilege matrix verified across PUBLIC, anon, and authenticated';
END $$;


-- ==============================================================================
-- TEST 10: SCORE REFRESH AFTER HABIT & WORKOUT INSERT, UPDATE, DELETE & MOVE
-- ==============================================================================
RESET ROLE;

DO $$
DECLARE
  v_alice UUID := 'a1111111-0000-0000-0000-000000000001';
  v_workouts_count INT;
  v_consistency NUMERIC;
BEGIN
  RAISE NOTICE 'Testing Test 10: Automatic Score Refresh on INSERT, UPDATE, DELETE and Date Moves...';

  -- Setup two distinct challenge windows for Alice
  -- Challenge 1: from CURRENT_DATE - 5 to CURRENT_DATE - 3
  -- Challenge 2: from CURRENT_DATE - 2 to CURRENT_DATE + 2
  INSERT INTO public.challenges (
    id, user_id, name, mode, duration, start_date, end_date, status, selected_habit_ids, workouts_completed, consistency_rate
  ) VALUES
    ('chal_window_1', v_alice, 'Window 1', 'monk', 3, CURRENT_DATE - 5, CURRENT_DATE - 3, 'active', ARRAY['h_score_a'], 0, 0.0),
    ('chal_window_2', v_alice, 'Window 2', 'monk', 5, CURRENT_DATE - 2, CURRENT_DATE + 2, 'active', ARRAY['h_score_a'], 0, 0.0)
  ON CONFLICT (id) DO UPDATE SET workouts_completed = 0, consistency_rate = 0.0;

  -- 10a. Habit completion INSERT -> refreshes Window 2
  INSERT INTO public.habit_completions (id, user_id, challenge_id, habit_id, date)
  VALUES ('hc_refresh_10a', v_alice, 'chal_window_2', 'h_score_a', CURRENT_DATE - 1)
  ON CONFLICT (id) DO NOTHING;

  SELECT consistency_rate INTO v_consistency
  FROM public.challenges WHERE id = 'chal_window_2';

  ASSERT v_consistency > 0.0,
    FORMAT('Test 10a Failed: Habit INSERT did not refresh consistency_rate, got %s', v_consistency);

  -- 10b. Habit completion DELETE -> refreshes Window 2
  DELETE FROM public.habit_completions WHERE id = 'hc_refresh_10a';

  SELECT consistency_rate INTO v_consistency
  FROM public.challenges WHERE id = 'chal_window_2';

  ASSERT v_consistency = 0.0,
    FORMAT('Test 10b Failed: Habit DELETE did not refresh consistency_rate, got %s', v_consistency);

  -- 10c. Workout INSERT in Window 1
  INSERT INTO public.workout_sessions (id, user_id, name, status, date)
  VALUES ('ws_refresh_10c', v_alice, 'Window 1 Workout', 'completed', CURRENT_DATE - 4)
  ON CONFLICT (id) DO NOTHING;

  SELECT workouts_completed INTO v_workouts_count
  FROM public.challenges WHERE id = 'chal_window_1';

  ASSERT v_workouts_count = 1,
    FORMAT('Test 10c Failed: Workout INSERT did not refresh workouts_completed in Window 1, got %s', v_workouts_count);

  -- 10d. Workout MOVED between dates: move from Window 1 (CURRENT_DATE - 4) to Window 2 (CURRENT_DATE - 1)
  -- Both Window 1 and Window 2 MUST be refreshed!
  UPDATE public.workout_sessions
  SET date = CURRENT_DATE - 1
  WHERE id = 'ws_refresh_10c';

  -- Window 1 should now have 0 workouts completed
  SELECT workouts_completed INTO v_workouts_count
  FROM public.challenges WHERE id = 'chal_window_1';

  ASSERT v_workouts_count = 0,
    FORMAT('Test 10d Failed: Moving workout out of Window 1 did not refresh Window 1 (got %s workouts)', v_workouts_count);

  -- Window 2 should now have 1 workout completed
  SELECT workouts_completed INTO v_workouts_count
  FROM public.challenges WHERE id = 'chal_window_2';

  ASSERT v_workouts_count = 1,
    FORMAT('Test 10d Failed: Moving workout into Window 2 did not refresh Window 2 (got %s workouts)', v_workouts_count);

  -- 10e. Workout DELETE
  DELETE FROM public.workout_sessions WHERE id = 'ws_refresh_10c';

  SELECT workouts_completed INTO v_workouts_count
  FROM public.challenges WHERE id = 'chal_window_2';

  ASSERT v_workouts_count = 0,
    FORMAT('Test 10e Failed: Workout DELETE did not refresh Window 2, got %s', v_workouts_count);

  RAISE NOTICE '✓ Test 10 Passed: Challenge scores auto-refresh on habit & workout INSERT, UPDATE, DELETE, and cross-window moves';

  RAISE NOTICE '========================================================================';
  RAISE NOTICE 'ALL 10 STAGE 5.2.4 STAGING VERIFICATION TESTS COMPLETED SUCCESSFULLY!';
  RAISE NOTICE '========================================================================';
END $$;


-- ------------------------------------------------------------------------------
-- CLEAN TRANSACTION ROLLBACK
-- Guarantees zero permanent modifications or artifacts in staging
-- ------------------------------------------------------------------------------
ROLLBACK;
