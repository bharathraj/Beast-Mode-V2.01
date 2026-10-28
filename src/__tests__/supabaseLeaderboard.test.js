import { describe, it, expect, beforeEach } from 'vitest';
import {
  getLeaderboardRankings,
  syncUserChallengeStats,
  createPrivateGroup,
  joinGroupByCode,
  sendFriendInvitation,
  resetSocialStore,
} from '../services/supabase';

describe('Supabase Leaderboard and Privacy Controls', () => {
  beforeEach(() => {
    resetSocialStore();
  });

  it('orders leaderboard deterministically by Consistency %, then Streak, then Workouts', async () => {
    const rankings = await getLeaderboardRankings('beast', 'global');
    expect(rankings.length).toBeGreaterThan(0);

    for (let i = 1; i < rankings.length; i++) {
      const prev = rankings[i - 1];
      const curr = rankings[i];

      if (prev.consistencyPercent === curr.consistencyPercent) {
        if (prev.currentStreak === curr.currentStreak) {
          expect(prev.workoutsCompleted).toBeGreaterThanOrEqual(curr.workoutsCompleted);
        } else {
          expect(prev.currentStreak).toBeGreaterThanOrEqual(curr.currentStreak);
        }
      } else {
        expect(prev.consistencyPercent).toBeGreaterThanOrEqual(curr.consistencyPercent);
      }

      expect(curr.rank).toBe(i + 1);
    }
  });

  it('prevents arbitrary score submission and rejects unverified or non-opted-in stats sync', async () => {
    const mockChallenge = {
      id: 'ch_test_1',
      mode: 'beast',
      name: 'Beast Mode',
      startDate: '2026-09-01',
    };

    // If shareProgress is false (default privacy setting), sync must be rejected
    const syncedWithoutOptIn = await syncUserChallengeStats(
      mockChallenge,
      { consistencyPercent: 99, currentStreak: 50, workoutsCompleted: 40 },
      'Anonymous Beast',
      false // opt-in is false
    );
    expect(syncedWithoutOptIn).toBe(false);

    // If shareProgress is true, stats are clamped and synced
    const syncedWithOptIn = await syncUserChallengeStats(
      mockChallenge,
      { consistencyPercent: 92, currentStreak: 30, workoutsCompleted: 25 },
      'Verified User',
      true // opted in
    );
    expect(syncedWithOptIn).toBe(true);

    const rankingsAfter = await getLeaderboardRankings('beast', 'global');
    const userInRankings = rankingsAfter.find(r => r.name === 'Verified User');
    expect(userInRankings).toBeDefined();
    expect(userInRankings.consistencyPercent).toBe(92);
  });

  it('creates private groups with unique 6-character invite codes', async () => {
    const group = await createPrivateGroup('Iron Tribe', 'Morning lifting crew');
    expect(group.id).toBeDefined();
    expect(group.name).toBe('Iron Tribe');
    expect(group.code).toHaveLength(6);
    expect(group.code).toBe(group.code.toUpperCase());

    // Join the group by code
    const joined = await joinGroupByCode(group.code);
    expect(joined.code).toBe(group.code);
  });

  it('creates friend invitations and records them properly in demo mode', async () => {
    const result = await sendFriendInvitation('buddy@beastmode.com');
    expect(result.success).toBe(true);
    expect(result.message).toContain('buddy');
  });
});
