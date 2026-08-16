package game

import "testing"

func TestLeaderboardEmpty(t *testing.T) {
	lb := NewLeaderboard()
	name, score, ok := lb.Top()
	if ok {
		t.Fatalf("empty leaderboard returned name=%s score=%d", name, score)
	}
}

func TestLeaderboardUpdatesOnHigherScore(t *testing.T) {
	lb := NewLeaderboard()
	lb.Update("alice", 5)
	name, score, ok := lb.Top()
	if !ok || name != "alice" || score != 5 {
		t.Fatalf("got (%s, %d, %v), want (alice, 5, true)", name, score, ok)
	}
	lb.Update("bob", 3)
	name, score, _ = lb.Top()
	if name != "alice" || score != 5 {
		t.Fatalf("got (%s, %d), want (alice, 5)", name, score)
	}
	lb.Update("bob", 10)
	name, score, _ = lb.Top()
	if name != "bob" || score != 10 {
		t.Fatalf("got (%s, %d), want (bob, 10)", name, score)
	}
}

func TestLeaderboardChangedFlag(t *testing.T) {
	lb := NewLeaderboard()
	if !lb.Update("alice", 5) {
		t.Fatal("first update should return changed=true")
	}
	if lb.Update("bob", 3) {
		t.Fatal("lower update should return changed=false")
	}
	if !lb.Update("bob", 10) {
		t.Fatal("higher update should return changed=true")
	}
}
