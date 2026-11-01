import { describe, it, expect, beforeEach } from 'vitest';
import {
  getLeaderboardRankings,
  getFriendsList,
  sendFriendInvitation,
  respondFriendInvitation,
  syncUserChallengeStats,
  updatePrivacyPreferences,
  resetSocialStore,
} from '../services/supabase';

describe('Stage 3 - Social and Leaderboard Rankings Verification', () => {
  beforeEach(() => {
    resetSocialStore();
  });

  it('Friends Only leaderboard displays ONLY accepted friends and the current user', async () => {
    // Default demo seed includes:
    // u_beast_01 (Arjun Verma - accepted friend)
    // u_beast_04 (Sneha Patel - accepted friend)
    // u_beast_02 (Priya Sharma - NOT a friend)
    // u_beast_03 (Vikram Mehta - NOT a friend)
    // u_beast_05 (Rohan Gupta - NOT a friend)

    const globalRankings = await getLeaderboardRankings('beast', 'global');
    expect(globalRankings.length).toBeGreaterThanOrEqual(5);

    const friendsRankings = await getLeaderboardRankings('beast', 'friends', 'current_user');
    // Only Arjun Verma and Sneha Patel should be present (or current_user if synced)
    const friendNames = friendsRankings.map(r => r.name);
    expect(friendNames).toContain('Arjun Verma');
    expect(friendNames).toContain('Sneha Patel');
    expect(friendNames).not.toContain('Priya Sharma');
    expect(friendNames).not.toContain('Vikram Mehta');
    expect(friendNames).not.toContain('Rohan Gupta');

    // Ranks should be 1-indexed and consecutive
    friendsRankings.forEach((entry, idx) => {
      expect(entry.rank).toBe(idx + 1);
    });
  });

  it('Pending or rejected friend requests NEVER appear on the Friends Only leaderboard', async () => {
    // Send a new friend invitation (starts as pending)
    await sendFriendInvitation('newfriend@example.com');
    const friends = await getFriendsList();
    const pendingFriend = friends.find(f => f.friendEmail === 'newfriend@example.com');
    expect(pendingFriend).toBeDefined();
    expect(pendingFriend.status).toBe('pending');

    // Check friends leaderboard
    const friendsRankings = await getLeaderboardRankings('beast', 'friends');
    const friendNames = friendsRankings.map(r => r.name);
    expect(friendNames).not.toContain('newfriend');
    expect(friendNames).not.toContain('newfriend@example.com');

    // Decline invitation
    await respondFriendInvitation(pendingFriend.id, false);
    const friendsAfterDecline = await getFriendsList();
    const declinedFriend = friendsAfterDecline.find(f => f.id === pendingFriend.id);
    expect(declinedFriend.status).toBe('declined');

    // Still must not appear
    const rankingsAfterDecline = await getLeaderboardRankings('beast', 'friends');
    expect(rankingsAfterDecline.map(r => r.name)).not.toContain('newfriend');
  });

  it('Global leaderboard remains global and returns all public opted-in participants', async () => {
    const globalRankings = await getLeaderboardRankings('beast', 'global');
    expect(globalRankings.length).toBe(5);
    const names = globalRankings.map(r => r.name);
    expect(names).toContain('Arjun Verma');
    expect(names).toContain('Priya Sharma');
    expect(names).toContain('Vikram Mehta');
    expect(names).toContain('Sneha Patel');
    expect(names).toContain('Rohan Gupta');
  });

  it('Prevents arbitrary score manipulation by clamping values to valid ranges', async () => {
    const mockChallenge = {
      id: 'ch_secure_1',
      mode: 'beast',
      name: 'Beast 90 Test',
      startDate: '2026-09-01',
    };

    // Attempt to pass malicious/manipulated scores:
    // consistency > 100, negative streak, negative workouts
    const syncRes = await syncUserChallengeStats(
      mockChallenge,
      {
        consistencyPercent: 999999, // Should be clamped to 100
        currentStreak: -50,         // Should be clamped to 0
        workoutsCompleted: -10,     // Should be clamped to 0
        challengeDay: 0,            // Should be clamped to 1
      },
      'Manipulated User',
      true
    );

    expect(syncRes).toBe(true);

    const rankings = await getLeaderboardRankings('beast', 'global');
    const userEntry = rankings.find(r => r.name === 'Manipulated User');
    expect(userEntry).toBeDefined();
    expect(userEntry.consistencyPercent).toBe(100); // Clamped
    expect(userEntry.currentStreak).toBe(0);         // Clamped
    expect(userEntry.workoutsCompleted).toBe(0);     // Clamped
    expect(userEntry.challengeDay).toBe(1);          // Clamped
  });

  it('Preserves privacy opt-out behavior and immediately removes user from leaderboards', async () => {
    const mockChallenge = {
      id: 'ch_privacy_1',
      mode: 'beast',
      name: 'Beast 90 Test',
      startDate: '2026-09-01',
    };

    // 1. Sync with opt-in
    await syncUserChallengeStats(
      mockChallenge,
      { consistencyPercent: 88, currentStreak: 10, workoutsCompleted: 15 },
      'OptIn User',
      true
    );

    let rankings = await getLeaderboardRankings('beast', 'global');
    expect(rankings.some(r => r.userId === 'current_user')).toBe(true);

    // 2. Opt out of sharing
    await updatePrivacyPreferences(false);

    rankings = await getLeaderboardRankings('beast', 'global');
    expect(rankings.some(r => r.userId === 'current_user')).toBe(false);
  });
});

